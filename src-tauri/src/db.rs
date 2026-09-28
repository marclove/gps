//! Opening the application database and keeping its structure up to date.

use std::path::Path;

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

/// The changes to the database structure, in the order they are applied.
/// Add new migrations to the end. Never change or remove a migration after it is released.
fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
        "CREATE TABLE meetings (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        notes      TEXT NOT NULL DEFAULT '',
        date       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );",
        ),
        M::up("ALTER TABLE meetings ADD COLUMN archived_at TEXT;"),
        M::up(
        "CREATE TABLE tasks (
        id           INTEGER PRIMARY KEY,
        meeting_id   INTEGER REFERENCES meetings(id),
        description  TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        completed_at TEXT
    );
    CREATE INDEX tasks_meeting_id ON tasks(meeting_id);",
        ),
        M::up(
        "CREATE TABLE initiatives (
        id           INTEGER PRIMARY KEY,
        name         TEXT NOT NULL DEFAULT '',
        description  TEXT NOT NULL DEFAULT '',
        raci_role    TEXT CHECK (raci_role IN ('responsible', 'accountable', 'consulted', 'informed')),
        horizon      TEXT NOT NULL DEFAULT 'later' CHECK (horizon IN ('now', 'next', 'later')),
        position     INTEGER NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        completed_at TEXT,
        archived_at  TEXT
    );
    CREATE INDEX initiatives_horizon_position ON initiatives(horizon, position);
    CREATE UNIQUE INDEX initiatives_name ON initiatives(name COLLATE NOCASE)
        WHERE archived_at IS NULL AND name <> '';
    ALTER TABLE meetings ADD COLUMN initiative_id INTEGER REFERENCES initiatives(id);
    CREATE INDEX meetings_initiative_id ON meetings(initiative_id);",
        ),
        M::up(
        "ALTER TABLE meetings RENAME COLUMN archived_at TO deleted_at;
    ALTER TABLE initiatives RENAME COLUMN archived_at TO deleted_at;",
        ),
    ])
}

/// Opens the database file at `path`, and creates it if it does not exist.
/// Applies all migrations that were not applied before.
pub fn open(path: &Path) -> Result<Connection, rusqlite_migration::Error> {
    let mut connection = Connection::open(path)?;
    prepare(&mut connection)?;
    Ok(connection)
}

/// Opens a new database that exists only in memory, with all migrations applied.
/// Use this function in tests.
#[cfg(test)]
pub fn open_in_memory() -> Connection {
    let mut connection = Connection::open_in_memory().expect("open in-memory database");
    prepare(&mut connection).expect("prepare database");
    connection
}

/// Applies all migrations that were not applied before, and then turns on the enforcement of
/// foreign keys.
///
/// Foreign keys are off while the migrations run. `SQLite` cannot rebuild a table that other
/// tables refer to while it enforces foreign keys, and it cannot change this setting inside a
/// transaction. Thus each migration that rebuilds a table must check the foreign keys itself
/// with `M::foreign_key_check`.
///
/// The bundled `SQLite` enforces foreign keys by default, but a different build may not. This
/// call makes sure that the connection always enforces them after the migrations.
fn prepare(connection: &mut Connection) -> Result<(), rusqlite_migration::Error> {
    apply(connection, &migrations())
}

/// Turns off the enforcement of foreign keys, applies `migrations`, and then turns the
/// enforcement on again.
fn apply(
    connection: &mut Connection,
    migrations: &Migrations,
) -> Result<(), rusqlite_migration::Error> {
    connection.pragma_update(None, "foreign_keys", false)?;
    migrations.to_latest(connection)?;
    connection.pragma_update(None, "foreign_keys", true)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_valid() {
        assert!(migrations().validate().is_ok());
    }

    #[test]
    fn open_creates_the_file_and_can_be_opened_again() {
        let dir = std::env::temp_dir().join(format!("gps-db-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("gps.sqlite");
        let connection = open(&path).unwrap();
        assert!(crate::meetings::list(&connection).unwrap().is_empty());
        let meeting = crate::meetings::create(&connection, "2026-09-24").unwrap();
        let task = crate::tasks::create(&connection, meeting.id, "Send the deck").unwrap();
        drop(connection);

        let connection = open(&path).unwrap();
        assert_eq!(
            crate::tasks::list_for_meeting(&connection, meeting.id).unwrap(),
            vec![task]
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn foreign_keys_are_enforced() {
        let connection = open_in_memory();
        let result = connection.execute(
            "INSERT INTO tasks (meeting_id, description, created_at, updated_at)
             VALUES (999, 'x', 't', 't')",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn migration_keeps_existing_meetings_in_the_list() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations().to_version(&mut connection, 1).unwrap();
        connection
            .execute(
                "INSERT INTO meetings (id, name, notes, date, created_at, updated_at)
                 VALUES (1, 'Kickoff', '', '2026-09-24', '2026-09-24T10:00:00.000Z',
                         '2026-09-24T10:00:00.000Z')",
                [],
            )
            .unwrap();

        prepare(&mut connection).unwrap();

        let meetings = crate::meetings::list(&connection).unwrap();
        assert_eq!(meetings.len(), 1);
        assert_eq!(meetings[0].name, "Kickoff");
    }

    #[test]
    fn migration_4_keeps_meetings_and_tasks_and_assigns_no_initiative() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations().to_version(&mut connection, 3).unwrap();
        connection
            .execute_batch(
                "INSERT INTO meetings (id, name, notes, date, created_at, updated_at)
                 VALUES (1, 'Kickoff', '', '2026-09-24', '2026-09-24T10:00:00.000Z',
                         '2026-09-24T10:00:00.000Z');
                 INSERT INTO tasks (id, meeting_id, description, created_at, updated_at)
                 VALUES (1, 1, 'Send the deck', '2026-09-24T10:00:00.000Z',
                         '2026-09-24T10:00:00.000Z');",
            )
            .unwrap();

        prepare(&mut connection).unwrap();

        let meeting = crate::meetings::get(&connection, 1).unwrap().unwrap();
        assert_eq!(meeting.name, "Kickoff");
        assert_eq!(meeting.initiative_id, None);
        let tasks = crate::tasks::list_for_meeting(&connection, 1).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].description, "Send the deck");
    }

    #[test]
    fn foreign_keys_are_on_after_open() {
        let connection = open_in_memory();
        let enabled: bool = connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert!(enabled);
    }

    /// Makes migrations that create a parent and a child table, add a child that refers to
    /// parent 1, and then rebuild the parent table. The rebuild copies the rows of the parent
    /// only if `copy_rows` is true.
    fn rebuild_migrations(copy_rows: bool) -> Migrations<'static> {
        let rebuild = if copy_rows {
            "CREATE TABLE parent_new (id INTEGER PRIMARY KEY);
             INSERT INTO parent_new (id) SELECT id FROM parent;
             DROP TABLE parent;
             ALTER TABLE parent_new RENAME TO parent;"
        } else {
            "CREATE TABLE parent_new (id INTEGER PRIMARY KEY);
             DROP TABLE parent;
             ALTER TABLE parent_new RENAME TO parent;"
        };
        Migrations::new(vec![
            M::up(
                "CREATE TABLE parent (id INTEGER PRIMARY KEY);
                 CREATE TABLE child (id INTEGER PRIMARY KEY,
                                     parent_id INTEGER REFERENCES parent(id));
                 INSERT INTO parent (id) VALUES (1);
                 INSERT INTO child (id, parent_id) VALUES (1, 1);",
            ),
            M::up(rebuild).foreign_key_check(),
        ])
    }

    #[test]
    fn a_migration_can_rebuild_a_table_that_others_refer_to() {
        let mut connection = Connection::open_in_memory().unwrap();

        apply(&mut connection, &rebuild_migrations(true)).unwrap();

        let parent_id: i64 = connection
            .query_row("SELECT parent_id FROM child WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(parent_id, 1);
        let result = connection.execute("INSERT INTO child (id, parent_id) VALUES (2, 99)", []);
        assert!(result.is_err());
    }

    #[test]
    fn a_migration_that_breaks_a_reference_fails() {
        let mut connection = Connection::open_in_memory().unwrap();

        let result = apply(&mut connection, &rebuild_migrations(false));

        assert!(matches!(
            result,
            Err(rusqlite_migration::Error::ForeignKeyCheck(_))
        ));
    }

    /// Checks that the meetings and initiatives tables use `deleted_at` and not `archived_at`,
    /// and that the unique index of initiative names ignores deleted rows.
    #[test]
    fn deleted_at_replaces_archived_at() {
        let connection = open_in_memory();
        for table in ["meetings", "initiatives"] {
            let columns: Vec<String> = connection
                .prepare(&format!("SELECT name FROM pragma_table_info('{table}')"))
                .unwrap()
                .query_map([], |row| row.get(0))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap();
            assert!(columns.contains(&"deleted_at".to_owned()), "{table}");
            assert!(!columns.contains(&"archived_at".to_owned()), "{table}");
        }
        let index: String = connection
            .query_row(
                "SELECT sql FROM sqlite_master WHERE name = 'initiatives_name'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(index.contains("deleted_at IS NULL"));
    }
}
