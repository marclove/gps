//! Storage of tasks, such as the action items of a meeting, in the application database.

use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::meetings::NOW;

/// One task that the user must do.
///
/// The stage of the task follows from `rank`, `started_at`, `completed_at`, and `deleted_at`.
/// A task without a rank is in the icebox. A task with a rank is in the backlog, or in current
/// work when it is started. A completed task is done. A completed or deleted task keeps its
/// rank and its start, so that it can go back to its place.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    /// The identifier that the database gives the task.
    pub id: i64,
    /// The identifier of the meeting that the task comes from, or `None` if the task is not
    /// part of a meeting.
    pub meeting_id: Option<i64>,
    /// The one line of text that tells what to do.
    pub title: String,
    /// The Markdown text that tells more about the task. It is empty when the user wrote
    /// nothing.
    pub description: String,
    /// The identifier of the project of the task, or `None` if the task is on no project.
    pub project_id: Option<i64>,
    /// The identifier of the initiative of the task, or `None` if the task is on no
    /// initiative. The initiative belongs to the project of the task.
    pub initiative_id: Option<i64>,
    /// The key that gives the place of the task in the list of prioritized tasks. It is
    /// `None` while the task is in the icebox.
    pub rank: Option<String>,
    /// The time when the task was created, as an RFC 3339 timestamp in UTC.
    pub created_at: String,
    /// The time when the content of the task was last changed, as an RFC 3339 timestamp in
    /// UTC.
    pub updated_at: String,
    /// The time when the user started the task, as an RFC 3339 timestamp in UTC. It is
    /// `None` if the task is not started.
    pub started_at: Option<String>,
    /// The time when the user first marked the task as completed, as an RFC 3339 timestamp
    /// in UTC. It is `None` if the task is not completed.
    pub completed_at: Option<String>,
    /// The time when the user deleted the task, as an RFC 3339 timestamp in UTC. It is
    /// `None` if the task is not deleted.
    pub deleted_at: Option<String>,
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

/// The columns that every query of this module reads, in the order that `task_from_row`
/// expects.
const COLUMNS: &str = "id, meeting_id, title, description, project_id, initiative_id, rank, \
                       created_at, updated_at, started_at, completed_at, deleted_at";

/// Returns the tasks that are not deleted, in no specific order.
pub fn list(connection: &Connection) -> Result<Vec<Task>, Error> {
    let mut statement = connection.prepare(&format!(
        "SELECT {COLUMNS} FROM tasks WHERE deleted_at IS NULL"
    ))?;
    let tasks = statement
        .query_map([], task_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(tasks)
}

/// Returns the task with the given identifier, also when the task is deleted. Returns `None`
/// if no task has this identifier.
pub fn get(connection: &Connection, id: i64) -> Result<Option<Task>, Error> {
    let task = connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM tasks WHERE id = ?1"),
            params![id],
            task_from_row,
        )
        .optional()?;
    Ok(task)
}

/// Returns the tasks of a meeting that are not deleted. The task that was created first is
/// first.
pub fn list_for_meeting(connection: &Connection, meeting_id: i64) -> Result<Vec<Task>, Error> {
    let mut statement = connection.prepare(&format!(
        "SELECT {COLUMNS} FROM tasks
         WHERE meeting_id = ?1 AND deleted_at IS NULL
         ORDER BY created_at, id"
    ))?;
    let tasks = statement
        .query_map(params![meeting_id], task_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(tasks)
}

/// Creates a task in the icebox for the given meeting. Stores the title as given.
///
/// The task gets the project of the meeting, unless that project is deleted. The task gets an
/// initiative only when the meeting covers exactly one initiative that is not deleted.
pub fn create_for_meeting(
    connection: &Connection,
    meeting_id: i64,
    title: &str,
) -> Result<Task, Error> {
    let transaction = connection.unchecked_transaction()?;
    let id: i64 = transaction
        .query_row(
            &format!(
                "INSERT INTO tasks
                     (meeting_id, title, project_id, initiative_id, created_at, updated_at)
                 SELECT meetings.id, ?2,
                        (SELECT projects.id FROM projects
                         WHERE projects.id = meetings.project_id
                           AND projects.deleted_at IS NULL),
                        (SELECT max(initiatives.id) FROM meeting_initiatives
                         JOIN initiatives
                           ON initiatives.id = meeting_initiatives.initiative_id
                         WHERE meeting_initiatives.meeting_id = meetings.id
                           AND initiatives.deleted_at IS NULL
                         HAVING count(*) = 1),
                        {NOW}, {NOW}
                 FROM meetings WHERE meetings.id = ?1
                 RETURNING id"
            ),
            params![meeting_id, title],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(Error::MeetingNotFound(meeting_id))?;
    let task = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    transaction.commit()?;
    Ok(task)
}

/// Replaces the title of a task, and sets the time it was last changed. Returns the
/// task as it is stored after the change.
pub fn update_title(connection: &Connection, id: i64, title: &str) -> Result<Task, Error> {
    let changed = connection.execute(
        &format!("UPDATE tasks SET title = ?2, updated_at = {NOW} WHERE id = ?1"),
        params![id, title],
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

fn task_from_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        meeting_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        project_id: row.get(4)?,
        initiative_id: row.get(5)?,
        rank: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        started_at: row.get(9)?,
        completed_at: row.get(10)?,
        deleted_at: row.get(11)?,
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
        create_for_meeting(&connection, first.id, "A").unwrap();
        create_for_meeting(&connection, second.id, "X").unwrap();
        create_for_meeting(&connection, first.id, "B").unwrap();

        let titles: Vec<String> = list_for_meeting(&connection, first.id)
            .unwrap()
            .into_iter()
            .map(|task| task.title)
            .collect();
        assert_eq!(titles, vec!["A", "B"]);
    }

    #[test]
    fn create_for_meeting_returns_a_task_that_is_not_completed() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();

        let task = create_for_meeting(&connection, meeting.id, "Send the deck").unwrap();

        assert_eq!(task.meeting_id, Some(meeting.id));
        assert_eq!(task.title, "Send the deck");
        assert_eq!(task.completed_at, None);
        assert_eq!(task.created_at, task.updated_at);
    }

    #[test]
    fn create_for_meeting_refuses_a_missing_meeting() {
        let connection = open_in_memory();
        assert!(matches!(
            create_for_meeting(&connection, 999, "x"),
            Err(Error::MeetingNotFound(999))
        ));
    }

    #[test]
    fn update_title_changes_the_text_and_updated_at() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let created = create_for_meeting(&connection, meeting.id, "Send the deck").unwrap();
        set_updated_at(&connection, created.id, OLD_TIME);

        let updated = update_title(&connection, created.id, "Send the final deck").unwrap();

        assert_eq!(updated.title, "Send the final deck");
        assert_eq!(updated.created_at, created.created_at);
        assert_ne!(updated.updated_at, OLD_TIME);
        assert_eq!(
            list_for_meeting(&connection, meeting.id).unwrap(),
            vec![updated]
        );
    }

    #[test]
    fn update_title_fails_for_an_unknown_task() {
        let connection = open_in_memory();
        assert!(matches!(
            update_title(&connection, 999, "x"),
            Err(Error::NotFound(999))
        ));
    }

    #[test]
    fn set_completed_records_the_first_completion_time_and_clears_it() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let created = create_for_meeting(&connection, meeting.id, "Send the deck").unwrap();
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
        let task = create_for_meeting(&connection, meeting.id, "Send the deck").unwrap();

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
    fn deleting_a_meeting_keeps_its_tasks() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let task = create_for_meeting(&connection, meeting.id, "Send the deck").unwrap();

        meetings::delete(&connection, meeting.id).unwrap();

        assert_eq!(
            list_for_meeting(&connection, meeting.id).unwrap(),
            vec![task]
        );
    }

    /// Stores a project, two initiatives of it, and a meeting about the project, with SQL.
    /// The meeting covers the initiatives in `covered`. Returns the identifier of the meeting.
    fn meeting_of_project(connection: &Connection, covered: &[i64]) -> i64 {
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, created_at, updated_at)
                 VALUES (1, 'Billing', 't', 't');
                 INSERT INTO initiatives (id, project_id, name, horizon, rank, created_at,
                                          updated_at)
                 VALUES (1, 1, 'Launch', 'now', 'a', 't', 't'),
                        (2, 1, 'Pilot', 'now', 'b', 't', 't');",
            )
            .unwrap();
        let meeting = meetings::create(connection, "2026-09-24").unwrap();
        connection
            .execute(
                "UPDATE meetings SET project_id = 1 WHERE id = ?1",
                params![meeting.id],
            )
            .unwrap();
        for initiative_id in covered {
            connection
                .execute(
                    "INSERT INTO meeting_initiatives (meeting_id, initiative_id, created_at)
                     VALUES (?1, ?2, 't')",
                    params![meeting.id, initiative_id],
                )
                .unwrap();
        }
        meeting.id
    }

    fn mark_deleted(connection: &Connection, table: &str, id: i64) {
        connection
            .execute(
                &format!("UPDATE {table} SET deleted_at = 'd' WHERE id = ?1"),
                params![id],
            )
            .unwrap();
    }

    #[test]
    fn list_leaves_out_deleted_tasks() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let kept = create_for_meeting(&connection, meeting.id, "A").unwrap();
        let deleted = create_for_meeting(&connection, meeting.id, "B").unwrap();
        mark_deleted(&connection, "tasks", deleted.id);

        assert_eq!(list(&connection).unwrap(), vec![kept]);
    }

    #[test]
    fn get_returns_a_deleted_task() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let task = create_for_meeting(&connection, meeting.id, "A").unwrap();
        mark_deleted(&connection, "tasks", task.id);

        let found = get(&connection, task.id).unwrap().unwrap();

        assert_eq!(found.deleted_at.as_deref(), Some("d"));
        assert_eq!(get(&connection, 999).unwrap(), None);
    }

    #[test]
    fn list_for_meeting_leaves_out_deleted_tasks() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let kept = create_for_meeting(&connection, meeting.id, "A").unwrap();
        let deleted = create_for_meeting(&connection, meeting.id, "B").unwrap();
        mark_deleted(&connection, "tasks", deleted.id);

        assert_eq!(
            list_for_meeting(&connection, meeting.id).unwrap(),
            vec![kept]
        );
    }

    #[test]
    fn create_for_meeting_puts_the_task_in_the_icebox() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();

        let task = create_for_meeting(&connection, meeting.id, "Send the deck").unwrap();

        assert_eq!(task.rank, None);
        assert_eq!(task.started_at, None);
        assert_eq!(task.deleted_at, None);
        assert_eq!(task.description, "");
        assert_eq!(task.project_id, None);
        assert_eq!(task.initiative_id, None);
    }

    #[test]
    fn create_for_meeting_gives_the_project_of_the_meeting() {
        let connection = open_in_memory();
        let meeting_id = meeting_of_project(&connection, &[]);

        let task = create_for_meeting(&connection, meeting_id, "Send the deck").unwrap();

        assert_eq!(task.project_id, Some(1));
        assert_eq!(task.initiative_id, None);
    }

    #[test]
    fn create_for_meeting_skips_a_deleted_project() {
        let connection = open_in_memory();
        let meeting_id = meeting_of_project(&connection, &[]);
        mark_deleted(&connection, "projects", 1);

        let task = create_for_meeting(&connection, meeting_id, "Send the deck").unwrap();

        assert_eq!(task.project_id, None);
    }

    #[test]
    fn create_for_meeting_gives_the_only_initiative_that_is_not_deleted() {
        let connection = open_in_memory();
        let meeting_id = meeting_of_project(&connection, &[1, 2]);
        mark_deleted(&connection, "initiatives", 1);

        let task = create_for_meeting(&connection, meeting_id, "Send the deck").unwrap();

        assert_eq!(task.project_id, Some(1));
        assert_eq!(task.initiative_id, Some(2));
    }

    #[test]
    fn create_for_meeting_gives_no_initiative_for_two_initiatives() {
        let connection = open_in_memory();
        let meeting_id = meeting_of_project(&connection, &[1, 2]);

        let task = create_for_meeting(&connection, meeting_id, "Send the deck").unwrap();

        assert_eq!(task.project_id, Some(1));
        assert_eq!(task.initiative_id, None);
    }
}
