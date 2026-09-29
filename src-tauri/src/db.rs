//! Opening the application database and keeping its structure up to date.

use std::path::Path;

use rusqlite::{params, Connection, Transaction};
use rusqlite_migration::{HookError, HookResult, Migrations, M};

use crate::rank;

/// Returns the changes to the database structure, in the order they are applied.
/// Add new migrations to the end. Never change or remove a migration after it is released.
///
/// The migrations run while foreign keys are not enforced. Thus every new migration that
/// changes a table or its data must end with `.foreign_key_check()`. This check stops the
/// migration and rolls it back when a reference points to a row that does not exist.
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
        )
        .foreign_key_check(),
        M::up_with_hook("ALTER TABLE initiatives ADD COLUMN rank TEXT;", fill_ranks)
            .foreign_key_check(),
        M::up(REBUILD_INITIATIVES).foreign_key_check(),
        M::up("ALTER TABLE tasks RENAME COLUMN description TO title;").foreign_key_check(),
        M::up(CREATE_PROJECTS).foreign_key_check(),
        M::up(PUT_INITIATIVES_IN_PROJECTS).foreign_key_check(),
        M::up(ADD_MEETING_INITIATIVES).foreign_key_check(),
        M::up(REBUILD_TASKS).foreign_key_check(),
    ])
}

/// Gives each initiative a rank that keeps the order of its old position.
///
/// In each column, takes all initiatives, completed and deleted ones included, in the order of
/// their position and then their identifier. Gives each initiative a rank after the rank of the
/// initiative before it.
fn fill_ranks(transaction: &Transaction) -> HookResult {
    let rows: Vec<(i64, String)> = transaction
        .prepare("SELECT id, horizon FROM initiatives ORDER BY horizon, position, id")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut previous: Option<(String, String)> = None;
    for (id, horizon) in rows {
        let before = previous
            .as_ref()
            .filter(|(previous_horizon, _)| *previous_horizon == horizon)
            .map(|(_, rank)| rank.as_str());
        let rank =
            rank::between(before, None).map_err(|error| HookError::Hook(error.to_string()))?;
        transaction.execute(
            "UPDATE initiatives SET rank = ?2 WHERE id = ?1",
            params![id, rank],
        )?;
        previous = Some((horizon, rank));
    }
    Ok(())
}

/// Rebuilds the table `initiatives` with `rank TEXT NOT NULL` in place of `position`, and
/// creates its indexes again. The rows keep their identifiers, so the references from
/// `meetings` stay valid.
const REBUILD_INITIATIVES: &str = "
CREATE TABLE initiatives_new (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    raci_role    TEXT CHECK (raci_role IN ('responsible', 'accountable', 'consulted', 'informed')),
    horizon      TEXT NOT NULL DEFAULT 'later' CHECK (horizon IN ('now', 'next', 'later')),
    rank         TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    completed_at TEXT,
    deleted_at   TEXT
);
INSERT INTO initiatives_new
    (id, name, description, raci_role, horizon, rank, created_at, updated_at, completed_at,
     deleted_at)
SELECT id, name, description, raci_role, horizon, rank, created_at, updated_at, completed_at,
       deleted_at
FROM initiatives;
DROP TABLE initiatives;
ALTER TABLE initiatives_new RENAME TO initiatives;
CREATE UNIQUE INDEX initiatives_name ON initiatives(name COLLATE NOCASE)
    WHERE deleted_at IS NULL AND name <> '';
CREATE UNIQUE INDEX initiatives_horizon_rank ON initiatives(horizon, rank)
    WHERE completed_at IS NULL AND deleted_at IS NULL;
";

/// Creates the table `projects` and the unique index of project names. The index ignores
/// deleted projects and empty names, and does not count the difference between uppercase and
/// lowercase letters.
const CREATE_PROJECTS: &str = "
CREATE TABLE projects (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE UNIQUE INDEX projects_name ON projects(name COLLATE NOCASE)
    WHERE deleted_at IS NULL AND name <> '';
";

/// Puts every initiative in a project, and gives each meeting an optional project.
///
/// If the table `initiatives` has rows, creates one project named "Unsorted" and puts every
/// initiative in it, also the completed and the deleted ones. A new project gets the largest
/// identifier, so `max(id)` finds it. If the table has no rows, creates no project.
///
/// Rebuilds the table `initiatives` with `project_id INTEGER NOT NULL`, because `SQLite` cannot
/// add such a column. The rows keep their identifiers, so the references from `meetings` stay
/// valid. The unique index of names now applies within one project.
///
/// Adds `project_id` to `meetings`, and gives each meeting that is assigned to an initiative the
/// project of that initiative.
const PUT_INITIATIVES_IN_PROJECTS: &str = "
INSERT INTO projects (name, description, created_at, updated_at)
SELECT 'Unsorted', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM initiatives);
CREATE TABLE initiatives_new (
    id           INTEGER PRIMARY KEY,
    project_id   INTEGER NOT NULL REFERENCES projects(id),
    name         TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    raci_role    TEXT CHECK (raci_role IN ('responsible', 'accountable', 'consulted', 'informed')),
    horizon      TEXT NOT NULL DEFAULT 'later' CHECK (horizon IN ('now', 'next', 'later')),
    rank         TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    completed_at TEXT,
    deleted_at   TEXT
);
INSERT INTO initiatives_new
    (id, project_id, name, description, raci_role, horizon, rank, created_at, updated_at,
     completed_at, deleted_at)
SELECT id, (SELECT max(id) FROM projects), name, description, raci_role, horizon, rank,
       created_at, updated_at, completed_at, deleted_at
FROM initiatives;
DROP TABLE initiatives;
ALTER TABLE initiatives_new RENAME TO initiatives;
CREATE UNIQUE INDEX initiatives_name ON initiatives(project_id, name COLLATE NOCASE)
    WHERE deleted_at IS NULL AND name <> '';
CREATE INDEX initiatives_project_id ON initiatives(project_id);
CREATE UNIQUE INDEX initiatives_horizon_rank ON initiatives(horizon, rank)
    WHERE completed_at IS NULL AND deleted_at IS NULL;
ALTER TABLE meetings ADD COLUMN project_id INTEGER REFERENCES projects(id);
CREATE INDEX meetings_project_id ON meetings(project_id);
UPDATE meetings
SET project_id = (SELECT project_id FROM initiatives WHERE initiatives.id = meetings.initiative_id)
WHERE initiative_id IS NOT NULL;
";

/// Moves the initiative of each meeting to the new table `meeting_initiatives`, so that a
/// meeting can cover any number of initiatives.
///
/// Creates `meeting_initiatives` with one row for each initiative that a meeting covers, and an
/// index that makes it fast to find the meetings of an initiative. Copies the `initiative_id`
/// of each meeting that has one into a row, also for deleted meetings and deleted initiatives.
/// The time when the user chose the initiative is not known, so the row gets the `updated_at`
/// of the meeting as `created_at`.
///
/// Rebuilds the table `meetings` without `initiative_id`, because `SQLite` cannot drop a column
/// that has a foreign key. The rows keep their identifiers and their project, so the references
/// from `tasks` and `meeting_initiatives` stay valid.
const ADD_MEETING_INITIATIVES: &str = "
CREATE TABLE meeting_initiatives (
    meeting_id    INTEGER NOT NULL REFERENCES meetings(id),
    initiative_id INTEGER NOT NULL REFERENCES initiatives(id),
    created_at    TEXT NOT NULL,
    PRIMARY KEY (meeting_id, initiative_id)
);
CREATE INDEX meeting_initiatives_initiative_id ON meeting_initiatives(initiative_id);
INSERT INTO meeting_initiatives (meeting_id, initiative_id, created_at)
SELECT id, initiative_id, updated_at FROM meetings WHERE initiative_id IS NOT NULL;
CREATE TABLE meetings_new (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    notes      TEXT NOT NULL DEFAULT '',
    date       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    project_id INTEGER REFERENCES projects(id)
);
INSERT INTO meetings_new
    (id, name, notes, date, created_at, updated_at, deleted_at, project_id)
SELECT id, name, notes, date, created_at, updated_at, deleted_at, project_id
FROM meetings;
DROP TABLE meetings;
ALTER TABLE meetings_new RENAME TO meetings;
CREATE INDEX meetings_project_id ON meetings(project_id);
";

/// Rebuilds the table `tasks` with the columns that store the description, the project, the
/// initiative, and the stage of a task, and creates its indexes again.
///
/// `SQLite` cannot add a check constraint to a table that exists, so the migration rebuilds the
/// table. The rows keep their identifiers. Each task keeps its title, meeting, times, and
/// completion, and gets an empty description. Each task gets the project of its meeting, also
/// when the meeting is deleted, unless the project is deleted. Each task gets the initiative of
/// its meeting when the meeting covers exactly one initiative that is not deleted. The rank, the
/// start, and the delete of each task stay empty, so an open task is in the icebox and a
/// completed task is done.
const REBUILD_TASKS: &str = "
CREATE TABLE tasks_new (
    id            INTEGER PRIMARY KEY,
    meeting_id    INTEGER REFERENCES meetings(id),
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    project_id    INTEGER REFERENCES projects(id),
    initiative_id INTEGER REFERENCES initiatives(id),
    rank          TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    started_at    TEXT,
    completed_at  TEXT,
    deleted_at    TEXT,
    CHECK (started_at IS NULL OR rank IS NOT NULL)
);
INSERT INTO tasks_new
    (id, meeting_id, title, description, project_id, initiative_id, rank, created_at,
     updated_at, started_at, completed_at, deleted_at)
SELECT tasks.id, tasks.meeting_id, tasks.title, '',
       (SELECT projects.id FROM meetings JOIN projects ON projects.id = meetings.project_id
        WHERE meetings.id = tasks.meeting_id AND projects.deleted_at IS NULL),
       (SELECT max(initiatives.id) FROM meeting_initiatives
        JOIN initiatives ON initiatives.id = meeting_initiatives.initiative_id
        WHERE meeting_initiatives.meeting_id = tasks.meeting_id
          AND initiatives.deleted_at IS NULL
        HAVING count(*) = 1),
       NULL, tasks.created_at, tasks.updated_at, NULL, tasks.completed_at, NULL
FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX tasks_meeting_id ON tasks(meeting_id);
CREATE INDEX tasks_project_id ON tasks(project_id);
CREATE INDEX tasks_initiative_id ON tasks(initiative_id);
CREATE UNIQUE INDEX tasks_rank ON tasks(rank)
    WHERE rank IS NOT NULL AND completed_at IS NULL AND deleted_at IS NULL;
";

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
///
/// If a migration fails, the enforcement of foreign keys stays off. Do not use the connection
/// after such a failure.
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
        let task =
            crate::tasks::create_for_meeting(&connection, meeting.id, "Send the deck").unwrap();
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
            "INSERT INTO tasks (meeting_id, title, created_at, updated_at)
             VALUES (999, 'x', 't', 't')",
            [],
        );
        assert!(
            matches!(
                result,
                Err(rusqlite::Error::SqliteFailure(ref error, _))
                    if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY
            ),
            "{result:?}"
        );
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
        assert!(meeting.initiative_ids.is_empty());
        let tasks = crate::tasks::list_for_meeting(&connection, 1).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Send the deck");
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

    /// The number of migrations before the migrations that replace `position` with `rank`.
    const VERSION_WITH_POSITION: usize = 5;

    #[test]
    fn migration_keeps_the_order_of_every_column_and_the_links_of_meetings() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations()
            .to_version(&mut connection, VERSION_WITH_POSITION)
            .unwrap();
        connection
            .execute_batch(
                "INSERT INTO initiatives
                     (id, name, horizon, position, created_at, updated_at, completed_at,
                      deleted_at)
                 VALUES (1, 'A', 'later', 1, 't', 't', NULL, NULL),
                        (2, 'B', 'later', 0, 't', 't', NULL, NULL),
                        (3, 'C', 'later', 1, 't', 't', NULL, NULL),
                        (4, 'Done', 'now', 0, 't', 't', 't', NULL),
                        (5, 'Deleted', 'now', 0, 't', 't', NULL, 't');
                 INSERT INTO meetings (id, name, notes, date, created_at, updated_at,
                                       initiative_id)
                 VALUES (1, 'Kickoff', '', '2026-09-24', 't', 't', 1);",
            )
            .unwrap();

        apply(&mut connection, &migrations()).unwrap();

        let later: Vec<String> = connection
            .prepare("SELECT name FROM initiatives WHERE horizon = 'later' ORDER BY rank")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(later, ["B", "A", "C"]);
        let repeated: i64 = connection
            .query_row(
                "SELECT count(*) FROM (
                     SELECT 1 FROM initiatives GROUP BY horizon, rank HAVING count(*) > 1
                 )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(repeated, 0);

        let columns: Vec<String> = connection
            .prepare("SELECT name FROM pragma_table_info('initiatives')")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert!(columns.contains(&"rank".to_owned()));
        assert!(!columns.contains(&"position".to_owned()));
        let initiative_id: i64 = connection
            .query_row(
                "SELECT initiative_id FROM meeting_initiatives WHERE meeting_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(initiative_id, 1);
        let enabled: bool = connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert!(enabled);

        let result = connection.execute(
            "UPDATE initiatives SET rank = (SELECT rank FROM initiatives WHERE id = 2)
             WHERE id = 3",
            [],
        );
        assert!(result.is_err());
    }

    /// The number of migrations before the migration that renames `description` to `title` in
    /// the table `tasks`.
    const VERSION_WITH_TASK_DESCRIPTION: usize = 7;

    #[test]
    fn migration_keeps_the_text_of_every_task_as_its_title() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations()
            .to_version(&mut connection, VERSION_WITH_TASK_DESCRIPTION)
            .unwrap();
        connection
            .execute_batch(
                "INSERT INTO meetings (id, name, notes, date, created_at, updated_at)
                 VALUES (1, 'Kickoff', '', '2026-09-24', 't', 't');
                 INSERT INTO tasks (id, meeting_id, description, created_at, updated_at)
                 VALUES (1, 1, 'Send the deck', 't', 't');",
            )
            .unwrap();

        apply(&mut connection, &migrations()).unwrap();

        let title: String = connection
            .query_row("SELECT title FROM tasks WHERE id = 1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(title, "Send the deck");
        assert_eq!(
            column_values::<String>(&connection, "tasks", "description"),
            [""]
        );
    }

    #[test]
    fn projects_table_exists_with_its_index() {
        let connection = open_in_memory();
        let index: String = connection
            .query_row(
                "SELECT sql FROM sqlite_master WHERE name = 'projects_name'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(index.contains("COLLATE NOCASE"), "{index}");
        assert!(index.contains("deleted_at IS NULL"), "{index}");
    }

    /// The number of migrations before the migration that puts every initiative in a project.
    const VERSION_WITHOUT_INITIATIVE_PROJECTS: usize = 9;

    /// Returns the values of one column of every row of `table`, in the order of the
    /// identifiers.
    fn column_values<T: rusqlite::types::FromSql>(
        connection: &Connection,
        table: &str,
        column: &str,
    ) -> Vec<T> {
        connection
            .prepare(&format!("SELECT {column} FROM {table} ORDER BY id"))
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    #[test]
    fn migration_puts_every_initiative_in_unsorted_and_gives_meetings_their_project() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations()
            .to_version(&mut connection, VERSION_WITHOUT_INITIATIVE_PROJECTS)
            .unwrap();
        connection
            .execute_batch(
                "INSERT INTO initiatives
                     (id, name, horizon, rank, created_at, updated_at, completed_at,
                      deleted_at)
                 VALUES (1, 'Board', 'now', 'a', 't', 't', NULL, NULL),
                        (2, 'Done', 'now', 'b', 't', 't', 't', NULL),
                        (3, 'Deleted', 'next', 'c', 't', 't', NULL, 't');
                 INSERT INTO meetings (id, name, notes, date, created_at, updated_at,
                                       initiative_id)
                 VALUES (1, 'Assigned', '', '2026-09-24', 't', 't', 2),
                        (2, 'Free', '', '2026-09-24', 't', 't', NULL);",
            )
            .unwrap();

        apply(&mut connection, &migrations()).unwrap();

        let projects: Vec<(i64, String, String)> = connection
            .prepare("SELECT id, name, description FROM projects")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(projects.len(), 1);
        let (unsorted, name, description) = projects[0].clone();
        assert_eq!(name, "Unsorted");
        assert_eq!(description, "");
        assert_eq!(
            column_values::<i64>(&connection, "initiatives", "project_id"),
            [unsorted, unsorted, unsorted]
        );
        assert_eq!(
            column_values::<String>(&connection, "initiatives", "rank"),
            ["a", "b", "c"]
        );
        assert_eq!(
            column_values::<Option<i64>>(&connection, "meetings", "project_id"),
            [Some(unsorted), None]
        );
        let links: Vec<(i64, i64)> = connection
            .prepare("SELECT meeting_id, initiative_id FROM meeting_initiatives")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(links, [(1, 2)]);
        let enabled: bool = connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert!(enabled);
        let result = connection.execute("UPDATE initiatives SET project_id = 999", []);
        assert!(result.is_err());
    }

    #[test]
    fn migration_of_an_empty_database_creates_no_project() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations()
            .to_version(&mut connection, VERSION_WITHOUT_INITIATIVE_PROJECTS)
            .unwrap();

        apply(&mut connection, &migrations()).unwrap();

        let count: i64 = connection
            .query_row("SELECT count(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    /// The number of migrations before the migration that moves the initiative of each meeting
    /// to the table `meeting_initiatives`.
    const VERSION_WITHOUT_MEETING_INITIATIVES: usize = 10;

    #[test]
    fn migration_copies_the_initiative_of_each_meeting_into_meeting_initiatives() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations()
            .to_version(&mut connection, VERSION_WITHOUT_MEETING_INITIATIVES)
            .unwrap();
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, created_at, updated_at)
                 VALUES (1, 'Billing', 't', 't');
                 INSERT INTO initiatives
                     (id, project_id, name, horizon, rank, created_at, updated_at, deleted_at)
                 VALUES (1, 1, 'Launch', 'now', 'a', 't', 't', NULL),
                        (2, 1, 'Pilot', 'now', 'b', 't', 't', 't');
                 INSERT INTO meetings (id, name, notes, date, created_at, updated_at,
                                       deleted_at, initiative_id, project_id)
                 VALUES (1, 'Sync', '', '2026-09-24', 't', 'u1', NULL, 1, 1),
                        (2, 'Review', '', '2026-09-24', 't', 'u2', 'd', 2, 1),
                        (3, 'Free', '', '2026-09-24', 't', 'u3', NULL, NULL, NULL);
                 INSERT INTO tasks (id, meeting_id, title, created_at, updated_at)
                 VALUES (1, 1, 'Send the deck', 't', 't');",
            )
            .unwrap();

        apply(&mut connection, &migrations()).unwrap();

        let links: Vec<(i64, i64, String)> = connection
            .prepare(
                "SELECT meeting_id, initiative_id, created_at FROM meeting_initiatives
                 ORDER BY meeting_id",
            )
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(links, [(1, 1, "u1".to_owned()), (2, 2, "u2".to_owned())]);
        let columns: Vec<String> = connection
            .prepare("SELECT name FROM pragma_table_info('meetings')")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert!(!columns.contains(&"initiative_id".to_owned()));
        assert_eq!(
            column_values::<Option<i64>>(&connection, "meetings", "project_id"),
            [Some(1), Some(1), None]
        );
        assert_eq!(
            column_values::<Option<String>>(&connection, "meetings", "deleted_at"),
            [None, Some("d".to_owned()), None]
        );
        assert_eq!(
            column_values::<Option<i64>>(&connection, "tasks", "meeting_id"),
            [Some(1)]
        );
        let enabled: bool = connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert!(enabled);
        let missing = connection.execute(
            "INSERT INTO meeting_initiatives (meeting_id, initiative_id, created_at)
             VALUES (1, 999, 't')",
            [],
        );
        assert!(missing.is_err());
        let missing_meeting = connection.execute(
            "INSERT INTO meeting_initiatives (meeting_id, initiative_id, created_at)
             VALUES (999, 1, 't')",
            [],
        );
        assert!(missing_meeting.is_err());
        let repeated = connection.execute(
            "INSERT INTO meeting_initiatives (meeting_id, initiative_id, created_at)
             VALUES (1, 1, 't')",
            [],
        );
        assert!(repeated.is_err());
        let index: i64 = connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'meetings_project_id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(index, 1);
    }

    /// The number of migrations before the migration that rebuilds the table `tasks` with the
    /// columns that store the stage of a task.
    const VERSION_WITHOUT_TASK_STAGES: usize = 11;

    /// Migrates a new database to the version before the rebuild of `tasks`, runs `seed`, and
    /// then applies all migrations.
    fn migrate_tasks_with(seed: &str) -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations()
            .to_version(&mut connection, VERSION_WITHOUT_TASK_STAGES)
            .unwrap();
        connection.execute_batch(seed).unwrap();
        apply(&mut connection, &migrations()).unwrap();
        connection
    }

    #[test]
    fn task_stages_migration_keeps_title_meeting_and_completion() {
        let connection = migrate_tasks_with(
            "INSERT INTO meetings (id, name, notes, date, created_at, updated_at)
             VALUES (1, 'Kickoff', '', '2026-09-24', 't', 't');
             INSERT INTO tasks (id, meeting_id, title, created_at, updated_at, completed_at)
             VALUES (1, 1, 'Send the deck', 'c1', 'u1', NULL),
                    (2, 1, 'Book the room', 'c2', 'u2', 'd2');",
        );

        let task = |id| crate::tasks::get(&connection, id).unwrap().unwrap();
        let expected = |id, title: &str, completed_at: Option<&str>| crate::tasks::Task {
            id,
            meeting_id: Some(1),
            title: title.to_owned(),
            description: String::new(),
            project_id: None,
            initiative_id: None,
            rank: None,
            created_at: format!("c{id}"),
            updated_at: format!("u{id}"),
            started_at: None,
            completed_at: completed_at.map(str::to_owned),
            deleted_at: None,
        };
        assert_eq!(task(1), expected(1, "Send the deck", None));
        assert_eq!(task(2), expected(2, "Book the room", Some("d2")));
        let enabled: bool = connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert!(enabled);
    }

    #[test]
    fn task_stages_migration_gives_the_project_of_the_meeting() {
        let connection = migrate_tasks_with(
            "INSERT INTO projects (id, name, created_at, updated_at)
             VALUES (1, 'Billing', 't', 't');
             INSERT INTO meetings (id, name, notes, date, created_at, updated_at, deleted_at,
                                   project_id)
             VALUES (1, 'Sync', '', '2026-09-24', 't', 't', NULL, 1),
                    (2, 'Old', '', '2026-09-24', 't', 't', 'd', 1),
                    (3, 'Free', '', '2026-09-24', 't', 't', NULL, NULL);
             INSERT INTO tasks (id, meeting_id, title, created_at, updated_at)
             VALUES (1, 1, 'A', 't', 't'),
                    (2, 2, 'B', 't', 't'),
                    (3, 3, 'C', 't', 't'),
                    (4, NULL, 'D', 't', 't');",
        );

        assert_eq!(
            column_values::<Option<i64>>(&connection, "tasks", "project_id"),
            [Some(1), Some(1), None, None]
        );
        let missing = connection.execute("UPDATE tasks SET project_id = 999 WHERE id = 1", []);
        assert!(missing.is_err());
    }

    #[test]
    fn task_stages_migration_skips_a_deleted_project() {
        let connection = migrate_tasks_with(
            "INSERT INTO projects (id, name, created_at, updated_at, deleted_at)
             VALUES (1, 'Billing', 't', 't', 'd');
             INSERT INTO meetings (id, name, notes, date, created_at, updated_at, project_id)
             VALUES (1, 'Sync', '', '2026-09-24', 't', 't', 1);
             INSERT INTO tasks (id, meeting_id, title, created_at, updated_at)
             VALUES (1, 1, 'A', 't', 't');",
        );

        assert_eq!(
            column_values::<Option<i64>>(&connection, "tasks", "project_id"),
            [None]
        );
    }

    #[test]
    fn task_stages_migration_gives_the_only_initiative_that_is_not_deleted() {
        let connection = migrate_tasks_with(
            "INSERT INTO projects (id, name, created_at, updated_at)
             VALUES (1, 'Billing', 't', 't');
             INSERT INTO initiatives
                 (id, project_id, name, horizon, rank, created_at, updated_at, deleted_at)
             VALUES (1, 1, 'Launch', 'now', 'a', 't', 't', NULL),
                    (2, 1, 'Pilot', 'now', 'b', 't', 't', 'd'),
                    (3, 1, 'Rollout', 'now', 'c', 't', 't', NULL);
             INSERT INTO meetings (id, name, notes, date, created_at, updated_at, project_id)
             VALUES (1, 'One live', '', '2026-09-24', 't', 't', 1),
                    (2, 'Two live', '', '2026-09-24', 't', 't', 1),
                    (3, 'None', '', '2026-09-24', 't', 't', 1);
             INSERT INTO meeting_initiatives (meeting_id, initiative_id, created_at)
             VALUES (1, 1, 't'), (1, 2, 't'), (2, 1, 't'), (2, 3, 't');
             INSERT INTO tasks (id, meeting_id, title, created_at, updated_at)
             VALUES (1, 1, 'A', 't', 't'),
                    (2, 2, 'B', 't', 't'),
                    (3, 3, 'C', 't', 't');",
        );

        assert_eq!(
            column_values::<Option<i64>>(&connection, "tasks", "initiative_id"),
            [Some(1), None, None]
        );
        let missing = connection.execute("UPDATE tasks SET initiative_id = 999 WHERE id = 1", []);
        assert!(missing.is_err());
    }

    #[test]
    fn task_stages_migration_refuses_a_started_task_without_rank() {
        let connection = migrate_tasks_with(
            "INSERT INTO tasks (id, meeting_id, title, created_at, updated_at)
             VALUES (1, NULL, 'A', 't', 't');",
        );

        let result = connection.execute("UPDATE tasks SET started_at = 's' WHERE id = 1", []);
        assert!(
            matches!(
                result,
                Err(rusqlite::Error::SqliteFailure(ref error, _))
                    if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_CHECK
            ),
            "{result:?}"
        );
        connection
            .execute(
                "UPDATE tasks SET rank = 'a', started_at = 's' WHERE id = 1",
                [],
            )
            .unwrap();
    }

    #[test]
    fn task_stages_migration_refuses_two_prioritized_tasks_with_one_rank() {
        let connection = migrate_tasks_with(
            "INSERT INTO tasks (id, meeting_id, title, created_at, updated_at)
             VALUES (1, NULL, 'A', 't', 't'),
                    (2, NULL, 'B', 't', 't'),
                    (3, NULL, 'C', 't', 't'),
                    (4, NULL, 'D', 't', 't');",
        );
        connection
            .execute("UPDATE tasks SET rank = 'a' WHERE id = 1", [])
            .unwrap();

        let result = connection.execute("UPDATE tasks SET rank = 'a' WHERE id = 2", []);
        assert!(
            matches!(
                result,
                Err(rusqlite::Error::SqliteFailure(ref error, _))
                    if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
            ),
            "{result:?}"
        );

        connection
            .execute(
                "UPDATE tasks SET rank = 'a', completed_at = 'd' WHERE id = 3",
                [],
            )
            .unwrap();
        connection
            .execute(
                "UPDATE tasks SET rank = 'a', deleted_at = 'd' WHERE id = 4",
                [],
            )
            .unwrap();
    }
}
