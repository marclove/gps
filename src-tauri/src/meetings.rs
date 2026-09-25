//! Storage of meetings and their notes in the application database.

use std::fmt;

use rusqlite::Connection;
use serde::Serialize;

/// The part of a meeting that the list of meetings shows. It does not include the notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingSummary {
    /// The identifier that the database gives the meeting.
    pub id: i64,
    /// The name of the meeting.
    pub name: String,
    /// The calendar date of the meeting, in the format `YYYY-MM-DD`.
    pub date: String,
    /// The time when the meeting was last changed, as an RFC 3339 timestamp in UTC.
    pub updated_at: String,
}

/// A problem that stops a meeting operation.
#[derive(Debug)]
pub enum Error {
    /// The database reported an error.
    Database(rusqlite::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Database(error) => write!(f, "database error: {error}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<rusqlite::Error> for Error {
    fn from(error: rusqlite::Error) -> Self {
        Error::Database(error)
    }
}

/// Returns summaries of all meetings. The newest date is first. For meetings with the same
/// date, the meeting that was created last is first.
pub fn list(connection: &Connection) -> Result<Vec<MeetingSummary>, Error> {
    let mut statement = connection.prepare(
        "SELECT id, name, date, updated_at FROM meetings
         ORDER BY date DESC, created_at DESC, id DESC",
    )?;
    let summaries = statement
        .query_map([], |row| {
            Ok(MeetingSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                date: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(summaries)
}

#[cfg(test)]
mod tests {
    use rusqlite::params;

    use super::*;
    use crate::db::open_in_memory;

    fn insert(connection: &Connection, name: &str, date: &str) -> i64 {
        connection
            .query_row(
                "INSERT INTO meetings (name, notes, date, created_at, updated_at)
                 VALUES (?1, '', ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 RETURNING id",
                params![name, date],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn list_is_empty_for_a_new_database() {
        assert!(list(&open_in_memory()).unwrap().is_empty());
    }

    #[test]
    fn list_orders_by_date_then_newest_created() {
        let connection = open_in_memory();
        let kickoff = insert(&connection, "Kickoff", "2026-09-18");
        let first_on_24th = insert(&connection, "Standup", "2026-09-24");
        let second_on_24th = insert(&connection, "Weekly sync", "2026-09-24");

        let summaries = list(&connection).unwrap();

        let ids: Vec<i64> = summaries.iter().map(|m| m.id).collect();
        assert_eq!(ids, vec![second_on_24th, first_on_24th, kickoff]);
        assert_eq!(summaries[0].name, "Weekly sync");
        assert_eq!(summaries[0].date, "2026-09-24");
        assert!(summaries[0].updated_at.ends_with('Z'));
    }
}
