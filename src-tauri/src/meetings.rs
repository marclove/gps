//! Storage of meetings and their notes in the application database.

use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

/// The name that a new meeting gets before the user changes it.
pub const DEFAULT_NAME: &str = "Untitled meeting";

/// One meeting, with its notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Meeting {
    /// The identifier that the database gives the meeting.
    pub id: i64,
    /// The name of the meeting.
    pub name: String,
    /// The calendar date of the meeting, in the format `YYYY-MM-DD`.
    pub date: String,
    /// The notes, as Markdown.
    pub notes: String,
    /// The time when the meeting was created, as an RFC 3339 timestamp in UTC.
    pub created_at: String,
    /// The time when the meeting was last changed, as an RFC 3339 timestamp in UTC.
    pub updated_at: String,
}

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
    /// No meeting has the given identifier.
    NotFound(i64),
    /// The date is not a real calendar date in the format `YYYY-MM-DD`.
    InvalidDate(String),
    /// The database reported an error.
    Database(rusqlite::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NotFound(id) => write!(f, "meeting {id} not found"),
            Error::InvalidDate(date) => {
                write!(
                    f,
                    "invalid meeting date \"{date}\": use the format YYYY-MM-DD"
                )
            }
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

/// The SQL expression for the current time, as an RFC 3339 timestamp in UTC with milliseconds.
const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/// Returns summaries of the meetings that are not archived. The newest date is first. For
/// meetings with the same date, the meeting that was created last is first.
pub fn list(connection: &Connection) -> Result<Vec<MeetingSummary>, Error> {
    let mut statement = connection.prepare(
        "SELECT id, name, date, updated_at FROM meetings
         WHERE archived_at IS NULL
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

/// Creates a meeting with the default name, empty notes, and the given date.
pub fn create(connection: &Connection, date: &str) -> Result<Meeting, Error> {
    validate_date(connection, date)?;
    let id = connection.query_row(
        &format!(
            "INSERT INTO meetings (name, notes, date, created_at, updated_at)
             VALUES (?1, '', ?2, {NOW}, {NOW}) RETURNING id"
        ),
        params![DEFAULT_NAME, date],
        |row| row.get(0),
    )?;
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Returns the meeting with the given identifier, or `None` if no meeting has it.
pub fn get(connection: &Connection, id: i64) -> Result<Option<Meeting>, Error> {
    let meeting = connection
        .query_row(
            "SELECT id, name, date, notes, created_at, updated_at FROM meetings WHERE id = ?1",
            params![id],
            meeting_from_row,
        )
        .optional()?;
    Ok(meeting)
}

/// Replaces the name, date, and notes of a meeting, and sets the time it was last changed.
/// Returns the meeting as it is stored after the change.
pub fn update(
    connection: &Connection,
    id: i64,
    name: &str,
    date: &str,
    notes: &str,
) -> Result<Meeting, Error> {
    validate_date(connection, date)?;
    let changed = connection.execute(
        &format!(
            "UPDATE meetings SET name = ?2, date = ?3, notes = ?4, updated_at = {NOW}
             WHERE id = ?1"
        ),
        params![id, name, date, notes],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Hides a meeting from the list of meetings without deleting it. Records the current time as
/// the time the meeting was archived. Archiving a meeting that is already archived keeps the
/// time that was recorded first, and does not change the name, date, notes, or `updated_at`.
pub fn archive(connection: &Connection, id: i64) -> Result<(), Error> {
    let changed = connection.execute(
        &format!("UPDATE meetings SET archived_at = coalesce(archived_at, {NOW}) WHERE id = ?1"),
        params![id],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    Ok(())
}

// SQLite's `date()` function returns NULL for text that is not a date, and moves impossible
// dates such as `2026-02-30` to a different day. A date is valid only if `date()` returns it
// unchanged.
fn validate_date(connection: &Connection, date: &str) -> Result<(), Error> {
    let valid: bool = connection.query_row(
        "SELECT length(?1) = 10 AND date(?1) IS ?1",
        params![date],
        |row| row.get(0),
    )?;
    if valid {
        Ok(())
    } else {
        Err(Error::InvalidDate(date.to_owned()))
    }
}

fn meeting_from_row(row: &Row<'_>) -> rusqlite::Result<Meeting> {
    Ok(Meeting {
        id: row.get(0)?,
        name: row.get(1)?,
        date: row.get(2)?,
        notes: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[test]
    fn list_is_empty_for_a_new_database() {
        assert!(list(&open_in_memory()).unwrap().is_empty());
    }

    #[test]
    fn create_uses_default_name_empty_notes_and_given_date() {
        let connection = open_in_memory();
        let meeting = create(&connection, "2026-09-24").unwrap();
        assert_eq!(meeting.name, "Untitled meeting");
        assert_eq!(meeting.notes, "");
        assert_eq!(meeting.date, "2026-09-24");
        assert_eq!(meeting.created_at, meeting.updated_at);
        assert_eq!(meeting.created_at.len(), "2026-09-24T17:03:12.456Z".len());
        assert!(meeting.created_at.ends_with('Z'));
    }

    #[test]
    fn create_rejects_invalid_dates() {
        let connection = open_in_memory();
        for date in [
            "",
            "yesterday",
            "2026-9-24",
            "2026-02-30",
            "2026-09-24T10:00",
        ] {
            assert!(
                matches!(create(&connection, date), Err(Error::InvalidDate(_))),
                "{date} should be rejected"
            );
        }
        assert!(list(&connection).unwrap().is_empty());
    }

    #[test]
    fn list_orders_by_date_then_newest_created() {
        let connection = open_in_memory();
        let kickoff = create(&connection, "2026-09-18").unwrap();
        let first_on_24th = create(&connection, "2026-09-24").unwrap();
        let second_on_24th = create(&connection, "2026-09-24").unwrap();
        let ids: Vec<i64> = list(&connection).unwrap().iter().map(|m| m.id).collect();
        assert_eq!(ids, vec![second_on_24th.id, first_on_24th.id, kickoff.id]);
    }

    #[test]
    fn get_returns_none_for_unknown_id() {
        let connection = open_in_memory();
        assert_eq!(get(&connection, 42).unwrap(), None);
    }

    #[test]
    fn update_replaces_fields_and_keeps_notes_unchanged() {
        let connection = open_in_memory();
        let created = create(&connection, "2026-09-24").unwrap();
        let notes = "## Agenda\n\n- [ ] Send notes to team\n";
        let updated = update(&connection, created.id, "Weekly sync", "2026-09-25", notes).unwrap();
        assert_eq!(updated.name, "Weekly sync");
        assert_eq!(updated.date, "2026-09-25");
        assert_eq!(updated.notes, notes);
        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at >= created.updated_at);
        assert_eq!(get(&connection, created.id).unwrap(), Some(updated));
    }

    #[test]
    fn update_reports_unknown_id_and_invalid_date() {
        let connection = open_in_memory();
        assert!(matches!(
            update(&connection, 42, "x", "2026-09-24", ""),
            Err(Error::NotFound(42))
        ));
        let created = create(&connection, "2026-09-24").unwrap();
        assert!(matches!(
            update(&connection, created.id, "x", "not a date", ""),
            Err(Error::InvalidDate(_))
        ));
        assert_eq!(get(&connection, created.id).unwrap(), Some(created));
    }

    #[test]
    fn list_leaves_out_archived_meetings() {
        let connection = open_in_memory();
        let kept = create(&connection, "2026-09-18").unwrap();
        let archived = create(&connection, "2026-09-24").unwrap();

        archive(&connection, archived.id).unwrap();

        let ids: Vec<i64> = list(&connection).unwrap().iter().map(|m| m.id).collect();
        assert_eq!(ids, vec![kept.id]);
    }

    #[test]
    fn archive_keeps_name_date_notes_and_updated_at() {
        let connection = open_in_memory();
        let created = create(&connection, "2026-09-24").unwrap();
        let notes = "## Agenda\n\n- [ ] Send notes to team\n";
        let updated = update(&connection, created.id, "Weekly sync", "2026-09-25", notes).unwrap();

        archive(&connection, created.id).unwrap();

        assert_eq!(get(&connection, created.id).unwrap(), Some(updated));
    }

    #[test]
    fn archive_twice_keeps_the_first_time() {
        let connection = open_in_memory();
        let created = create(&connection, "2026-09-24").unwrap();

        archive(&connection, created.id).unwrap();
        connection
            .execute(
                "UPDATE meetings SET archived_at = '2026-01-01T00:00:00.000Z' WHERE id = ?1",
                params![created.id],
            )
            .unwrap();
        archive(&connection, created.id).unwrap();

        let archived_at: String = connection
            .query_row(
                "SELECT archived_at FROM meetings WHERE id = ?1",
                params![created.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(archived_at, "2026-01-01T00:00:00.000Z");
    }

    #[test]
    fn archive_reports_unknown_id() {
        let connection = open_in_memory();
        assert!(matches!(archive(&connection, 42), Err(Error::NotFound(42))));
    }

    #[test]
    fn update_changes_an_archived_meeting() {
        let connection = open_in_memory();
        let created = create(&connection, "2026-09-24").unwrap();

        archive(&connection, created.id).unwrap();
        let updated = update(
            &connection,
            created.id,
            "Weekly sync",
            "2026-09-25",
            "new notes",
        )
        .unwrap();

        assert_eq!(get(&connection, created.id).unwrap(), Some(updated.clone()));
        assert_eq!(updated.notes, "new notes");
    }
}
