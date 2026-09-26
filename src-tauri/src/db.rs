//! Opening the application database and keeping its structure up to date.

use std::path::Path;

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

/// The changes to the database structure, in the order they are applied.
/// Add new migrations to the end. Never change or remove a migration after it is released.
const MIGRATIONS: &[M<'static>] = &[
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
];

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

/// Turns on the enforcement of foreign keys and applies the migrations. The bundled `SQLite`
/// enforces foreign keys by default, but a different build may not. This call makes sure that
/// the connection always enforces them.
fn prepare(connection: &mut Connection) -> Result<(), rusqlite_migration::Error> {
    connection.pragma_update(None, "foreign_keys", true)?;
    migrate(connection)
}

fn migrate(connection: &mut Connection) -> Result<(), rusqlite_migration::Error> {
    Migrations::from_slice(MIGRATIONS).to_latest(connection)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_valid() {
        assert!(Migrations::from_slice(MIGRATIONS).validate().is_ok());
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
        Migrations::from_slice(&MIGRATIONS[..1])
            .to_latest(&mut connection)
            .unwrap();
        connection
            .execute(
                "INSERT INTO meetings (id, name, notes, date, created_at, updated_at)
                 VALUES (1, 'Kickoff', '', '2026-09-24', '2026-09-24T10:00:00.000Z',
                         '2026-09-24T10:00:00.000Z')",
                [],
            )
            .unwrap();

        migrate(&mut connection).unwrap();

        let meetings = crate::meetings::list(&connection).unwrap();
        assert_eq!(meetings.len(), 1);
        assert_eq!(meetings[0].name, "Kickoff");
    }
}
