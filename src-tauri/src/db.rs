//! Opening the application database and keeping its structure up to date.

use std::path::Path;

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

/// The changes to the database structure, in the order they are applied.
/// Add new migrations to the end. Never change or remove a migration after it is released.
const MIGRATIONS: &[M<'static>] = &[M::up(
    "CREATE TABLE meetings (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        notes      TEXT NOT NULL DEFAULT '',
        date       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );",
)];

/// Opens the database file at `path`, and creates it if it does not exist.
/// Applies all migrations that were not applied before.
pub fn open(path: &Path) -> Result<Connection, rusqlite_migration::Error> {
    let mut connection = Connection::open(path)?;
    migrate(&mut connection)?;
    Ok(connection)
}

/// Opens a new database that exists only in memory, with all migrations applied.
/// Use this function in tests.
#[cfg(test)]
pub fn open_in_memory() -> Connection {
    let mut connection = Connection::open_in_memory().expect("open in-memory database");
    migrate(&mut connection).expect("apply migrations");
    connection
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
        drop(open(&path).unwrap());
        let connection = open(&path).unwrap();
        let count: i64 = connection
            .query_row("SELECT count(*) FROM meetings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
