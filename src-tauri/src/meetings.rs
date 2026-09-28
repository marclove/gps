//! Storage of meetings and their notes in the application database.
//!
//! A meeting is about one project or about no project. A meeting covers any number of
//! initiatives, including none. Each initiative that a meeting covers belongs to the project of
//! the meeting.

use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::projects;

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
    /// The identifiers of the initiatives that the meeting covers, also deleted ones, in
    /// ascending order.
    pub initiative_ids: Vec<i64>,
    /// The identifier of the project that the meeting is about, or `None` if the meeting is
    /// about no project. The project can be deleted.
    pub project_id: Option<i64>,
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
    /// The identifier of the project that the meeting is about, or `None` if the meeting is
    /// about no project. The project can be deleted.
    pub project_id: Option<i64>,
}

/// A problem that stops a meeting operation.
#[derive(Debug)]
pub enum Error {
    /// No meeting has the given identifier.
    NotFound(i64),
    /// The date is not a real calendar date in the format `YYYY-MM-DD`.
    InvalidDate(String),
    /// No initiative has the given identifier.
    InitiativeNotFound(i64),
    /// No project has the given identifier.
    ProjectNotFound(i64),
    /// The project with the given identifier is deleted, so a meeting cannot get it.
    ProjectDeleted(i64),
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
            Error::InitiativeNotFound(id) => write!(f, "initiative {id} not found"),
            Error::ProjectNotFound(id) => write!(f, "project {id} not found"),
            Error::ProjectDeleted(id) => write!(f, "project {id} is deleted"),
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
pub(crate) const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/// Returns summaries of the meetings that are not deleted. The newest date is first. For
/// meetings with the same date, the meeting that was created last is first.
pub fn list(connection: &Connection) -> Result<Vec<MeetingSummary>, Error> {
    let mut statement = connection.prepare(
        "SELECT id, name, date, updated_at, project_id FROM meetings
         WHERE deleted_at IS NULL
         ORDER BY date DESC, created_at DESC, id DESC",
    )?;
    let summaries = statement
        .query_map([], |row| {
            Ok(MeetingSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                date: row.get(2)?,
                updated_at: row.get(3)?,
                project_id: row.get(4)?,
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
    let Some(mut meeting) = connection
        .query_row(
            "SELECT id, name, date, notes, created_at, updated_at, project_id
             FROM meetings WHERE id = ?1",
            params![id],
            meeting_from_row,
        )
        .optional()?
    else {
        return Ok(None);
    };
    meeting.initiative_ids = connection
        .prepare(
            "SELECT initiative_id FROM meeting_initiatives WHERE meeting_id = ?1
             ORDER BY initiative_id",
        )?
        .query_map(params![id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(Some(meeting))
}

/// Replaces the name, date, and notes of a meeting, and sets the time it was last changed.
/// Does not change the initiatives or the project of the meeting. Returns the meeting as it is
/// stored after the change.
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

/// Makes a meeting cover only the initiative `initiative_id`, or no initiative when
/// `initiative_id` is `None`. The initiative can be completed or deleted. Sets the time the
/// meeting was last changed. Returns the meeting as it is stored after the change.
///
/// When the meeting covers an initiative after the change, also sets the project of the
/// meeting to the project of that initiative. When the meeting covers no initiative after the
/// change, does not change the project.
pub fn set_initiative(
    connection: &Connection,
    id: i64,
    initiative_id: Option<i64>,
) -> Result<Meeting, Error> {
    let transaction = connection.unchecked_transaction()?;
    let changed = if let Some(initiative_id) = initiative_id {
        let project_id: i64 = transaction
            .query_row(
                "SELECT project_id FROM initiatives WHERE id = ?1",
                params![initiative_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or(Error::InitiativeNotFound(initiative_id))?;
        transaction.execute(
            &format!("UPDATE meetings SET project_id = ?2, updated_at = {NOW} WHERE id = ?1"),
            params![id, project_id],
        )?
    } else {
        transaction.execute(
            &format!("UPDATE meetings SET updated_at = {NOW} WHERE id = ?1"),
            params![id],
        )?
    };
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    transaction.execute(
        "DELETE FROM meeting_initiatives WHERE meeting_id = ?1",
        params![id],
    )?;
    if let Some(initiative_id) = initiative_id {
        transaction.execute(
            &format!(
                "INSERT INTO meeting_initiatives (meeting_id, initiative_id, created_at)
                 VALUES (?1, ?2, {NOW})"
            ),
            params![id, initiative_id],
        )?;
    }
    transaction.commit()?;
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Sets the project that a meeting is about, or sets no project when `project_id` is `None`.
/// Returns the meeting as it is stored after the change.
///
/// If the project changes, also removes all initiatives from the meeting, and sets the time the
/// meeting was last changed. If the meeting already has the project, changes
/// nothing, also when the project is deleted. Otherwise the project must exist and must not be
/// deleted.
pub fn set_project(
    connection: &Connection,
    id: i64,
    project_id: Option<i64>,
) -> Result<Meeting, Error> {
    let transaction = connection.unchecked_transaction()?;
    let meeting = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    if meeting.project_id == project_id {
        return Ok(meeting);
    }
    if let Some(project_id) = project_id {
        if !projects::project_is_active(&transaction, project_id)? {
            return Err(if projects::project_exists(&transaction, project_id)? {
                Error::ProjectDeleted(project_id)
            } else {
                Error::ProjectNotFound(project_id)
            });
        }
    }
    transaction.execute(
        &format!("UPDATE meetings SET project_id = ?2, updated_at = {NOW} WHERE id = ?1"),
        params![id, project_id],
    )?;
    transaction.execute(
        "DELETE FROM meeting_initiatives WHERE meeting_id = ?1",
        params![id],
    )?;
    transaction.commit()?;
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Marks a meeting as deleted, so that the list of meetings does not show it. The row stays in
/// the database. Records the current time as the time the meeting was deleted. Deleting a
/// meeting that is already deleted keeps the time that was recorded first, and does not change
/// the name, date, notes, or `updated_at`.
pub fn delete(connection: &Connection, id: i64) -> Result<(), Error> {
    let changed = connection.execute(
        &format!("UPDATE meetings SET deleted_at = coalesce(deleted_at, {NOW}) WHERE id = ?1"),
        params![id],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    Ok(())
}

/// Makes a deleted meeting appear in the list of meetings again.
pub fn restore(connection: &Connection, id: i64) -> Result<(), Error> {
    let changed = connection.execute(
        "UPDATE meetings SET deleted_at = NULL WHERE id = ?1",
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
        initiative_ids: Vec::new(),
        project_id: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::{initiatives, projects};

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
    fn list_leaves_out_deleted_meetings() {
        let connection = open_in_memory();
        let kept = create(&connection, "2026-09-18").unwrap();
        let deleted = create(&connection, "2026-09-24").unwrap();

        delete(&connection, deleted.id).unwrap();

        let ids: Vec<i64> = list(&connection).unwrap().iter().map(|m| m.id).collect();
        assert_eq!(ids, vec![kept.id]);
    }

    #[test]
    fn delete_keeps_name_date_notes_and_updated_at() {
        let connection = open_in_memory();
        let created = create(&connection, "2026-09-24").unwrap();
        let notes = "## Agenda\n\n- [ ] Send notes to team\n";
        let updated = update(&connection, created.id, "Weekly sync", "2026-09-25", notes).unwrap();

        delete(&connection, created.id).unwrap();

        assert_eq!(get(&connection, created.id).unwrap(), Some(updated));
    }

    #[test]
    fn delete_twice_keeps_the_first_time() {
        let connection = open_in_memory();
        let created = create(&connection, "2026-09-24").unwrap();

        delete(&connection, created.id).unwrap();
        connection
            .execute(
                "UPDATE meetings SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = ?1",
                params![created.id],
            )
            .unwrap();
        delete(&connection, created.id).unwrap();

        let deleted_at: String = connection
            .query_row(
                "SELECT deleted_at FROM meetings WHERE id = ?1",
                params![created.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(deleted_at, "2026-01-01T00:00:00.000Z");
    }

    #[test]
    fn delete_reports_unknown_id() {
        let connection = open_in_memory();
        assert!(matches!(delete(&connection, 42), Err(Error::NotFound(42))));
    }

    #[test]
    fn restore_returns_the_meeting_to_the_list() {
        let connection = open_in_memory();
        let kickoff = create(&connection, "2026-09-18").unwrap();
        let weekly_sync = create(&connection, "2026-09-24").unwrap();

        delete(&connection, weekly_sync.id).unwrap();
        restore(&connection, weekly_sync.id).unwrap();

        let ids: Vec<i64> = list(&connection).unwrap().iter().map(|m| m.id).collect();
        assert_eq!(ids, vec![weekly_sync.id, kickoff.id]);
    }

    #[test]
    fn restore_reports_unknown_id() {
        let connection = open_in_memory();
        assert!(matches!(restore(&connection, 42), Err(Error::NotFound(42))));
    }

    #[test]
    fn update_changes_a_deleted_meeting() {
        let connection = open_in_memory();
        let created = create(&connection, "2026-09-24").unwrap();

        delete(&connection, created.id).unwrap();
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

    const OLD_TIME: &str = "2000-01-01T00:00:00.000Z";

    fn set_updated_at(connection: &Connection, id: i64, time: &str) {
        connection
            .execute(
                "UPDATE meetings SET updated_at = ?2 WHERE id = ?1",
                params![id, time],
            )
            .unwrap();
    }

    /// Creates a project with the given name and returns its identifier.
    fn new_project(connection: &Connection, name: &str) -> i64 {
        match projects::create(connection, name, "").unwrap() {
            projects::CreateOutcome::Created { project } => project.id,
            projects::CreateOutcome::NameTaken => panic!("the create should succeed"),
        }
    }

    /// Creates an initiative with a description in the given project and returns it.
    fn initiative_in(connection: &Connection, project_id: i64) -> initiatives::Initiative {
        match initiatives::create(connection, project_id, "", "x", None).unwrap() {
            initiatives::CreateOutcome::Created { initiative } => initiative,
            initiatives::CreateOutcome::NameTaken => panic!("the create should succeed"),
        }
    }

    /// Creates an initiative with a description in a new project without a name, and returns
    /// the initiative.
    fn new_initiative(connection: &Connection) -> initiatives::Initiative {
        let project_id = match projects::create(connection, "", "x").unwrap() {
            projects::CreateOutcome::Created { project } => project.id,
            projects::CreateOutcome::NameTaken => panic!("an empty name is never taken"),
        };
        initiative_in(connection, project_id)
    }

    #[test]
    fn a_new_meeting_has_no_initiative() {
        let connection = open_in_memory();
        let meeting = create(&connection, "2026-09-24").unwrap();
        assert!(meeting.initiative_ids.is_empty());
    }

    #[test]
    fn set_initiative_assigns_removes_and_changes_updated_at() {
        let connection = open_in_memory();
        let initiative = new_initiative(&connection);
        let created = create(&connection, "2026-09-24").unwrap();
        set_updated_at(&connection, created.id, OLD_TIME);

        let assigned = set_initiative(&connection, created.id, Some(initiative.id)).unwrap();
        assert_eq!(assigned.initiative_ids, vec![initiative.id]);
        assert_ne!(assigned.updated_at, OLD_TIME);
        assert_eq!(get(&connection, created.id).unwrap(), Some(assigned));

        set_updated_at(&connection, created.id, OLD_TIME);
        let removed = set_initiative(&connection, created.id, None).unwrap();
        assert!(removed.initiative_ids.is_empty());
        assert_ne!(removed.updated_at, OLD_TIME);
        assert_eq!(get(&connection, created.id).unwrap(), Some(removed));
    }

    #[test]
    fn set_initiative_accepts_deleted_and_completed_initiatives() {
        let connection = open_in_memory();
        let deleted = new_initiative(&connection);
        initiatives::delete(&connection, deleted.id).unwrap();
        let completed = new_initiative(&connection);
        initiatives::move_to(&connection, completed.id, "done", 0).unwrap();
        let meeting = create(&connection, "2026-09-24").unwrap();

        let assigned = set_initiative(&connection, meeting.id, Some(deleted.id)).unwrap();
        assert_eq!(assigned.initiative_ids, vec![deleted.id]);
        let assigned = set_initiative(&connection, meeting.id, Some(completed.id)).unwrap();
        assert_eq!(assigned.initiative_ids, vec![completed.id]);
    }

    #[test]
    fn set_initiative_refuses_a_missing_initiative() {
        let connection = open_in_memory();
        let created = create(&connection, "2026-09-24").unwrap();

        assert!(matches!(
            set_initiative(&connection, created.id, Some(999)),
            Err(Error::InitiativeNotFound(999))
        ));
        assert_eq!(
            Error::InitiativeNotFound(999).to_string(),
            "initiative 999 not found"
        );
        assert_eq!(get(&connection, created.id).unwrap(), Some(created));
    }

    #[test]
    fn set_initiative_on_a_missing_meeting_returns_not_found() {
        let connection = open_in_memory();
        let initiative = new_initiative(&connection);
        assert!(matches!(
            set_initiative(&connection, 42, Some(initiative.id)),
            Err(Error::NotFound(42))
        ));
        assert!(matches!(
            set_initiative(&connection, 42, None),
            Err(Error::NotFound(42))
        ));
    }

    #[test]
    fn update_does_not_change_the_initiative() {
        let connection = open_in_memory();
        let initiative = new_initiative(&connection);
        let created = create(&connection, "2026-09-24").unwrap();
        set_initiative(&connection, created.id, Some(initiative.id)).unwrap();

        let updated = update(&connection, created.id, "Weekly sync", "2026-09-25", "").unwrap();

        assert_eq!(updated.initiative_ids, vec![initiative.id]);
    }

    #[test]
    fn a_new_meeting_has_no_project() {
        let connection = open_in_memory();
        let meeting = create(&connection, "2026-09-24").unwrap();
        assert_eq!(meeting.project_id, None);
        assert_eq!(list(&connection).unwrap()[0].project_id, None);
    }

    #[test]
    fn set_initiative_sets_the_project_of_the_initiative() {
        let connection = open_in_memory();
        let billing = new_project(&connection, "Billing");
        let checkout = new_project(&connection, "Checkout");
        let initiative = initiative_in(&connection, checkout);
        let meeting = create(&connection, "2026-09-24").unwrap();
        set_project(&connection, meeting.id, Some(billing)).unwrap();

        let assigned = set_initiative(&connection, meeting.id, Some(initiative.id)).unwrap();

        assert_eq!(assigned.initiative_ids, vec![initiative.id]);
        assert_eq!(assigned.project_id, Some(checkout));
        assert_eq!(get(&connection, meeting.id).unwrap(), Some(assigned));
        assert_eq!(list(&connection).unwrap()[0].project_id, Some(checkout));

        let removed = set_initiative(&connection, meeting.id, None).unwrap();
        assert!(removed.initiative_ids.is_empty());
        assert_eq!(removed.project_id, Some(checkout));
    }

    #[test]
    fn set_project_clears_the_initiative_when_it_changes() {
        let connection = open_in_memory();
        let billing = new_project(&connection, "Billing");
        let initiative = new_initiative(&connection);
        let meeting = create(&connection, "2026-09-24").unwrap();
        set_initiative(&connection, meeting.id, Some(initiative.id)).unwrap();
        set_updated_at(&connection, meeting.id, OLD_TIME);

        let moved = set_project(&connection, meeting.id, Some(billing)).unwrap();

        assert_eq!(moved.project_id, Some(billing));
        assert!(moved.initiative_ids.is_empty());
        assert_ne!(moved.updated_at, OLD_TIME);
        assert_eq!(get(&connection, meeting.id).unwrap(), Some(moved));

        set_updated_at(&connection, meeting.id, OLD_TIME);
        let cleared = set_project(&connection, meeting.id, None).unwrap();
        assert_eq!(cleared.project_id, None);
        assert_ne!(cleared.updated_at, OLD_TIME);
    }

    #[test]
    fn set_project_to_the_same_project_changes_nothing() {
        let connection = open_in_memory();
        let initiative = new_initiative(&connection);
        let meeting = create(&connection, "2026-09-24").unwrap();
        set_initiative(&connection, meeting.id, Some(initiative.id)).unwrap();
        set_updated_at(&connection, meeting.id, OLD_TIME);
        let before = get(&connection, meeting.id).unwrap().unwrap();

        let same = set_project(&connection, meeting.id, Some(initiative.project_id)).unwrap();

        assert_eq!(same, before);
        assert_eq!(same.initiative_ids, vec![initiative.id]);
        assert_eq!(same.updated_at, OLD_TIME);

        let other = create(&connection, "2026-09-24").unwrap();
        set_updated_at(&connection, other.id, OLD_TIME);
        assert_eq!(
            set_project(&connection, other.id, None).unwrap().updated_at,
            OLD_TIME
        );
    }

    #[test]
    fn set_project_refuses_a_deleted_project_but_a_meeting_keeps_one() {
        let connection = open_in_memory();
        let billing = new_project(&connection, "Billing");
        let checkout = new_project(&connection, "Checkout");
        let meeting = create(&connection, "2026-09-24").unwrap();
        set_project(&connection, meeting.id, Some(billing)).unwrap();
        projects::delete(&connection, billing).unwrap();
        projects::delete(&connection, checkout).unwrap();
        let before = get(&connection, meeting.id).unwrap().unwrap();

        assert!(matches!(
            set_project(&connection, meeting.id, Some(checkout)),
            Err(Error::ProjectDeleted(id)) if id == checkout
        ));
        assert!(matches!(
            set_project(&connection, meeting.id, Some(999)),
            Err(Error::ProjectNotFound(999))
        ));
        assert!(matches!(
            set_project(&connection, 42, None),
            Err(Error::NotFound(42))
        ));
        assert_eq!(get(&connection, meeting.id).unwrap(), Some(before.clone()));
        assert_eq!(before.project_id, Some(billing));
        assert_eq!(
            set_project(&connection, meeting.id, Some(billing)).unwrap(),
            before
        );
        assert_eq!(Error::ProjectNotFound(7).to_string(), "project 7 not found");
        assert_eq!(Error::ProjectDeleted(7).to_string(), "project 7 is deleted");
    }
}
