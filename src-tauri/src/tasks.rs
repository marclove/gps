//! Storage of tasks, such as the action items of a meeting, in the application database.

use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::meetings::NOW;

/// One task that the user must do.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    /// The identifier that the database gives the task.
    pub id: i64,
    /// The identifier of the meeting that the task comes from, or `None` if the task is not
    /// part of a meeting.
    pub meeting_id: Option<i64>,
    /// The text that tells what to do.
    pub description: String,
    /// The time when the task was created, as an RFC 3339 timestamp in UTC.
    pub created_at: String,
    /// The time when the description or the completion was last changed, as an RFC 3339
    /// timestamp in UTC.
    pub updated_at: String,
    /// The time when the user first marked the task as completed, as an RFC 3339 timestamp
    /// in UTC. It is `None` if the task is not completed.
    pub completed_at: Option<String>,
}

/// A problem that stops a task operation.
#[derive(Debug)]
pub enum Error {
    /// No task has the given identifier.
    NotFound(i64),
    /// No meeting has the given identifier.
    MeetingNotFound(i64),
    /// The database reported an error.
    Database(rusqlite::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NotFound(id) => write!(f, "task {id} not found"),
            Error::MeetingNotFound(id) => write!(f, "meeting {id} not found"),
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

/// Returns the tasks of a meeting. The task that was created first is first.
pub fn list_for_meeting(connection: &Connection, meeting_id: i64) -> Result<Vec<Task>, Error> {
    let mut statement = connection.prepare(
        "SELECT id, meeting_id, description, created_at, updated_at, completed_at FROM tasks
         WHERE meeting_id = ?1
         ORDER BY created_at, id",
    )?;
    let tasks = statement
        .query_map(params![meeting_id], task_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(tasks)
}

/// Creates a task that is not completed, for the given meeting. Stores the description as
/// given.
pub fn create(connection: &Connection, meeting_id: i64, description: &str) -> Result<Task, Error> {
    let meeting_exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM meetings WHERE id = ?1)",
        params![meeting_id],
        |row| row.get(0),
    )?;
    if !meeting_exists {
        return Err(Error::MeetingNotFound(meeting_id));
    }
    let id = connection.query_row(
        &format!(
            "INSERT INTO tasks (meeting_id, description, created_at, updated_at)
             VALUES (?1, ?2, {NOW}, {NOW}) RETURNING id"
        ),
        params![meeting_id, description],
        |row| row.get(0),
    )?;
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Replaces the description of a task, and sets the time it was last changed. Returns the
/// task as it is stored after the change.
pub fn update_description(
    connection: &Connection,
    id: i64,
    description: &str,
) -> Result<Task, Error> {
    let changed = connection.execute(
        &format!("UPDATE tasks SET description = ?2, updated_at = {NOW} WHERE id = ?1"),
        params![id, description],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Marks a task as completed or not completed, and sets the time it was last changed. When
/// `completed` is true, records the current time as the completion time. If the task is
/// already completed, it keeps the time that was recorded first. When `completed` is false,
/// clears the completion time. Returns the task as it is stored after the change.
pub fn set_completed(connection: &Connection, id: i64, completed: bool) -> Result<Task, Error> {
    let completed_at = if completed {
        format!("coalesce(completed_at, {NOW})")
    } else {
        "NULL".to_owned()
    };
    let changed = connection.execute(
        &format!(
            "UPDATE tasks SET completed_at = {completed_at}, updated_at = {NOW} WHERE id = ?1"
        ),
        params![id],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Deletes a task permanently.
pub fn delete(connection: &Connection, id: i64) -> Result<(), Error> {
    let changed = connection.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    Ok(())
}

fn get(connection: &Connection, id: i64) -> Result<Option<Task>, Error> {
    let task = connection
        .query_row(
            "SELECT id, meeting_id, description, created_at, updated_at, completed_at FROM tasks
             WHERE id = ?1",
            params![id],
            task_from_row,
        )
        .optional()?;
    Ok(task)
}

fn task_from_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        meeting_id: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        completed_at: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::meetings;

    const OLD_TIME: &str = "2000-01-01T00:00:00.000Z";

    fn set_updated_at(connection: &Connection, id: i64, time: &str) {
        connection
            .execute(
                "UPDATE tasks SET updated_at = ?2 WHERE id = ?1",
                params![id, time],
            )
            .unwrap();
    }

    #[test]
    fn list_for_meeting_returns_only_that_meetings_tasks_oldest_first() {
        let connection = open_in_memory();
        let first = meetings::create(&connection, "2026-09-24").unwrap();
        let second = meetings::create(&connection, "2026-09-24").unwrap();
        create(&connection, first.id, "A").unwrap();
        create(&connection, second.id, "X").unwrap();
        create(&connection, first.id, "B").unwrap();

        let descriptions: Vec<String> = list_for_meeting(&connection, first.id)
            .unwrap()
            .into_iter()
            .map(|task| task.description)
            .collect();
        assert_eq!(descriptions, vec!["A", "B"]);
    }

    #[test]
    fn create_returns_a_task_that_is_not_completed() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();

        let task = create(&connection, meeting.id, "Send the deck").unwrap();

        assert_eq!(task.meeting_id, Some(meeting.id));
        assert_eq!(task.description, "Send the deck");
        assert_eq!(task.completed_at, None);
        assert_eq!(task.created_at, task.updated_at);
    }

    #[test]
    fn create_fails_for_a_meeting_that_does_not_exist() {
        let connection = open_in_memory();
        assert!(matches!(
            create(&connection, 999, "x"),
            Err(Error::MeetingNotFound(999))
        ));
    }

    #[test]
    fn update_description_changes_the_text_and_updated_at() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let created = create(&connection, meeting.id, "Send the deck").unwrap();
        set_updated_at(&connection, created.id, OLD_TIME);

        let updated = update_description(&connection, created.id, "Send the final deck").unwrap();

        assert_eq!(updated.description, "Send the final deck");
        assert_eq!(updated.created_at, created.created_at);
        assert_ne!(updated.updated_at, OLD_TIME);
        assert_eq!(
            list_for_meeting(&connection, meeting.id).unwrap(),
            vec![updated]
        );
    }

    #[test]
    fn update_description_fails_for_an_unknown_task() {
        let connection = open_in_memory();
        assert!(matches!(
            update_description(&connection, 999, "x"),
            Err(Error::NotFound(999))
        ));
    }

    #[test]
    fn set_completed_records_the_first_completion_time_and_clears_it() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let created = create(&connection, meeting.id, "Send the deck").unwrap();
        set_updated_at(&connection, created.id, OLD_TIME);

        let completed = set_completed(&connection, created.id, true).unwrap();
        assert!(completed.completed_at.is_some());
        assert_ne!(completed.updated_at, OLD_TIME);

        connection
            .execute(
                "UPDATE tasks SET completed_at = ?2 WHERE id = ?1",
                params![created.id, OLD_TIME],
            )
            .unwrap();
        let completed_again = set_completed(&connection, created.id, true).unwrap();
        assert_eq!(completed_again.completed_at.as_deref(), Some(OLD_TIME));

        set_updated_at(&connection, created.id, OLD_TIME);
        let uncompleted = set_completed(&connection, created.id, false).unwrap();
        assert_eq!(uncompleted.completed_at, None);
        assert_ne!(uncompleted.updated_at, OLD_TIME);

        assert!(matches!(
            set_completed(&connection, 999, true),
            Err(Error::NotFound(999))
        ));
    }

    #[test]
    fn delete_removes_the_task() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let task = create(&connection, meeting.id, "Send the deck").unwrap();

        delete(&connection, task.id).unwrap();

        assert!(list_for_meeting(&connection, meeting.id)
            .unwrap()
            .is_empty());
        assert!(matches!(
            delete(&connection, task.id),
            Err(Error::NotFound(id)) if id == task.id
        ));
    }

    #[test]
    fn archiving_a_meeting_keeps_its_tasks() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let task = create(&connection, meeting.id, "Send the deck").unwrap();

        meetings::archive(&connection, meeting.id).unwrap();

        assert_eq!(
            list_for_meeting(&connection, meeting.id).unwrap(),
            vec![task]
        );
    }
}
