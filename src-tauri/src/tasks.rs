//! Storage of tasks, such as the action items of a meeting, in the application database.

use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use crate::meetings::NOW;
use crate::rank;

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
    /// UTC. Only a change of the title, the description, the project, or the initiative
    /// changes it. A move, a start, a completion, a reopen, a delete, and a restore do not
    /// change it.
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

/// The column of the Work board where the user puts a task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Destination {
    /// The prioritized tasks that the user started.
    Current,
    /// The prioritized tasks that the user did not start.
    Backlog,
    /// The tasks that are not prioritized.
    Icebox,
    /// The completed tasks.
    Done,
}

/// A problem that stops a task operation.
#[derive(Debug)]
pub enum Error {
    /// No task has the given identifier.
    NotFound(i64),
    /// No meeting has the given identifier.
    MeetingNotFound(i64),
    /// The task is deleted, so the operation cannot change it.
    Deleted(i64),
    /// The task is completed, so the operation cannot move it.
    Completed(i64),
    /// The task is not in the backlog, so it cannot be started.
    NotInBacklog(i64),
    /// A stored rank is not a valid rank key, so no rank can be made next to it.
    Rank(rank::Error),
    /// The database reported an error.
    Database(rusqlite::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NotFound(id) => write!(f, "task {id} not found"),
            Error::MeetingNotFound(id) => write!(f, "meeting {id} not found"),
            Error::Deleted(id) => write!(f, "task {id} is deleted"),
            Error::Completed(id) => write!(f, "task {id} is completed"),
            Error::NotInBacklog(id) => write!(f, "task {id} is not in the backlog"),
            Error::Rank(error) => write!(f, "invalid rank: {error}"),
            Error::Database(error) => write!(f, "database error: {error}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<rank::Error> for Error {
    fn from(error: rank::Error) -> Self {
        Error::Rank(error)
    }
}

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

/// Moves a task to a column of the Work board. Returns the task as it is stored after the
/// move.
///
/// For `Destination::Current` and `Destination::Backlog`, the task goes to the place `index`
/// among the cards of that column, counted from 0 without the task. An index below 0 counts as
/// 0, and an index larger than the column counts as the end of the column. The task gets a
/// rank in the one list of prioritized tasks:
///
/// - If a card of the column is above the place, the task goes directly after that card in the
///   list.
/// - Else, if the column has a card, the task goes directly before its first card in the list.
/// - Else, the task goes to the end of the list.
///
/// A move to current work starts the task, and keeps a start time that the task has. A move
/// to the backlog clears the start time.
///
/// A move to the icebox clears the rank and the start time. A move to done completes the task
/// and keeps its rank and its start time. For these two, `index` is ignored.
///
/// No other task changes. Does not change `updated_at`. Refuses a completed or a deleted task.
/// If a neighbor has a rank that is not valid, returns `Error::Rank` and changes nothing.
pub fn move_to(
    connection: &Connection,
    id: i64,
    destination: Destination,
    index: i64,
) -> Result<Task, Error> {
    let transaction = connection.unchecked_transaction()?;
    let task = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    if task.deleted_at.is_some() {
        return Err(Error::Deleted(id));
    }
    if task.completed_at.is_some() {
        return Err(Error::Completed(id));
    }
    match destination {
        Destination::Current | Destination::Backlog => {
            let started = destination == Destination::Current;
            let rank = rank_at(&transaction, id, started, index)?;
            transaction.execute(
                &format!(
                    "UPDATE tasks
                     SET rank = ?2,
                         started_at = CASE WHEN ?3 THEN coalesce(started_at, {NOW}) END
                     WHERE id = ?1"
                ),
                params![id, rank, started],
            )?;
        }
        Destination::Icebox => {
            transaction.execute(
                "UPDATE tasks SET rank = NULL, started_at = NULL WHERE id = ?1",
                params![id],
            )?;
        }
        Destination::Done => {
            transaction.execute(
                &format!("UPDATE tasks SET completed_at = {NOW} WHERE id = ?1"),
                params![id],
            )?;
        }
    }
    let task = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    transaction.commit()?;
    Ok(task)
}

/// Starts a task in the backlog, so that it goes to current work. The task keeps its rank, so
/// it keeps its place in the list. Returns the task as it is stored after the change.
///
/// Does not change `updated_at`. Refuses a deleted task, and a task that is not in the
/// backlog.
pub fn start(connection: &Connection, id: i64) -> Result<Task, Error> {
    let transaction = connection.unchecked_transaction()?;
    let task = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    if task.deleted_at.is_some() {
        return Err(Error::Deleted(id));
    }
    if task.rank.is_none() || task.started_at.is_some() || task.completed_at.is_some() {
        return Err(Error::NotInBacklog(id));
    }
    transaction.execute(
        &format!("UPDATE tasks SET started_at = {NOW} WHERE id = ?1"),
        params![id],
    )?;
    let task = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    transaction.commit()?;
    Ok(task)
}

/// Marks a task as completed or not completed. Returns the task as it is stored after the
/// change.
///
/// When `completed` is true, records the current time as the completion time. The task keeps
/// its rank and its start time. If the task is already completed, it keeps the time that was
/// recorded first.
///
/// When `completed` is false, clears the completion time, and the task goes back to its held
/// place: to current work or to the backlog when it has a rank, and to the icebox when it has
/// no rank. If a prioritized task has its rank now, the task goes directly after that task.
/// Reopening a task that is not completed changes nothing.
///
/// Does not change `updated_at`. Refuses a deleted task.
pub fn set_completed(connection: &Connection, id: i64, completed: bool) -> Result<Task, Error> {
    let transaction = connection.unchecked_transaction()?;
    let task = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    if task.deleted_at.is_some() {
        return Err(Error::Deleted(id));
    }
    if completed {
        transaction.execute(
            &format!("UPDATE tasks SET completed_at = coalesce(completed_at, {NOW}) WHERE id = ?1"),
            params![id],
        )?;
    } else if task.completed_at.is_some() {
        return_to_held_place(&transaction, id)?;
        transaction.execute(
            "UPDATE tasks SET completed_at = NULL WHERE id = ?1",
            params![id],
        )?;
    }
    let task = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    transaction.commit()?;
    Ok(task)
}

/// Marks a task as deleted. The row stays in the database with its stage and its held place,
/// so that the delete can be undone. Records the current time as the time the task was
/// deleted. Deleting a task that is already deleted keeps the time that was recorded first.
/// Does not change `updated_at`.
pub fn delete(connection: &Connection, id: i64) -> Result<(), Error> {
    let changed = connection.execute(
        &format!("UPDATE tasks SET deleted_at = coalesce(deleted_at, {NOW}) WHERE id = ?1"),
        params![id],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    Ok(())
}

/// Brings a deleted task back to its stage. Returns the task as it is stored after the change.
///
/// A task in current work or in the backlog goes back to its held place. If a prioritized task
/// has its rank now, the task goes directly after that task. A completed task goes back to
/// done, and a task in the icebox goes back to the icebox. Restoring a task that is not
/// deleted changes nothing. Does not change `updated_at`.
pub fn restore(connection: &Connection, id: i64) -> Result<Task, Error> {
    let transaction = connection.unchecked_transaction()?;
    let task = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    if task.deleted_at.is_none() {
        return Ok(task);
    }
    if task.completed_at.is_none() {
        return_to_held_place(&transaction, id)?;
    }
    transaction.execute(
        "UPDATE tasks SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )?;
    let task = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    transaction.commit()?;
    Ok(task)
}

/// Returns the rank and the "is started" flag of each prioritized task that is not completed
/// and not deleted, in the order of the ranks. The task `except` is not in the result.
fn list_ranks(connection: &Connection, except: i64) -> Result<Vec<(String, bool)>, Error> {
    let mut statement = connection.prepare(
        "SELECT rank, started_at IS NOT NULL FROM tasks
         WHERE rank IS NOT NULL AND completed_at IS NULL AND deleted_at IS NULL AND id != ?1
         ORDER BY rank",
    )?;
    let ranks = statement
        .query_map(params![except], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ranks)
}

/// Makes the rank for the task `id` at the place `index` of current work, when `started` is
/// true, or of the backlog, when `started` is false.
fn rank_at(connection: &Connection, id: i64, started: bool, index: i64) -> Result<String, Error> {
    let list = list_ranks(connection, id)?;
    let column: Vec<usize> = list
        .iter()
        .enumerate()
        .filter(|(_, (_, is_started))| *is_started == started)
        .map(|(position, _)| position)
        .collect();
    let index = usize::try_from(index.max(0)).map_or(column.len(), |index| index.min(column.len()));
    let rank_of = |position: usize| list.get(position).map(|(rank, _)| rank.as_str());
    let (before, after) = if index > 0 {
        let above = column[index - 1];
        (rank_of(above), rank_of(above + 1))
    } else if let Some(&below) = column.first() {
        (below.checked_sub(1).and_then(rank_of), rank_of(below))
    } else {
        (list.last().map(|(rank, _)| rank.as_str()), None)
    };
    Ok(rank::between(before, after)?)
}

/// Gives the task `id` a rank directly after the prioritized task that holds its rank, if one
/// does. The new rank is between the held rank and the next greater rank in the list. A task
/// without a rank, or whose rank no prioritized task holds, does not change.
///
/// Call this before the task is prioritized again, that is, before its completion time or its
/// delete time is cleared, because the database refuses two prioritized tasks with the same
/// rank.
fn return_to_held_place(connection: &Connection, id: i64) -> Result<(), Error> {
    let held: Option<String> =
        connection.query_row("SELECT rank FROM tasks WHERE id = ?1", params![id], |row| {
            row.get(0)
        })?;
    let Some(held) = held else {
        return Ok(());
    };
    let list = list_ranks(connection, id)?;
    if !list.iter().any(|(rank, _)| *rank == held) {
        return Ok(());
    }
    let next = list
        .iter()
        .map(|(rank, _)| rank.as_str())
        .find(|rank| *rank > held.as_str());
    let rank = rank::between(Some(&held), next)?;
    connection.execute(
        "UPDATE tasks SET rank = ?2 WHERE id = ?1",
        params![id, rank],
    )?;
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

    /// Stores a task outside a meeting with SQL. A task with `rank` is prioritized, and
    /// `started` gives it the start time `"s"`. Returns the identifier of the task.
    fn seed(connection: &Connection, title: &str, rank: Option<&str>, started: bool) -> i64 {
        connection
            .query_row(
                "INSERT INTO tasks (title, rank, started_at, created_at, updated_at)
                 VALUES (?1, ?2, CASE WHEN ?3 THEN 's' END, 't', ?4)
                 RETURNING id",
                params![title, rank, started, OLD_TIME],
                |row| row.get(0),
            )
            .unwrap()
    }

    fn seed_icebox(connection: &Connection, title: &str) -> i64 {
        seed(connection, title, None, false)
    }

    fn task(connection: &Connection, id: i64) -> Task {
        get(connection, id).unwrap().unwrap()
    }

    /// Returns the titles of the prioritized tasks in the order of the list, each with a
    /// star when the task is started.
    fn list_order(connection: &Connection) -> Vec<String> {
        let mut tasks: Vec<Task> = list(connection)
            .unwrap()
            .into_iter()
            .filter(|task| task.rank.is_some() && task.completed_at.is_none())
            .collect();
        tasks.sort_by(|a, b| a.rank.cmp(&b.rank));
        tasks
            .into_iter()
            .map(|task| {
                if task.started_at.is_some() {
                    format!("{}*", task.title)
                } else {
                    task.title
                }
            })
            .collect()
    }

    fn set_column(connection: &Connection, id: i64, column: &str, value: &str) {
        connection
            .execute(
                &format!("UPDATE tasks SET {column} = ?2 WHERE id = ?1"),
                params![id, value],
            )
            .unwrap();
    }

    #[test]
    fn move_to_backlog_prioritizes_an_icebox_task_at_the_index() {
        let connection = open_in_memory();
        seed(&connection, "A", Some("4"), false);
        seed(&connection, "B", Some("8"), false);
        let x = seed_icebox(&connection, "X");

        let moved = move_to(&connection, x, Destination::Backlog, 1).unwrap();

        assert!(moved.rank.is_some());
        assert_eq!(moved.started_at, None);
        assert_eq!(list_order(&connection), ["A", "X", "B"]);
    }

    #[test]
    fn move_to_current_starts_the_task_and_keeps_an_existing_start_time() {
        let connection = open_in_memory();
        let x = seed_icebox(&connection, "X");
        let y = seed(&connection, "Y", Some("8"), true);

        let started = move_to(&connection, x, Destination::Current, 0).unwrap();
        assert!(started.started_at.is_some());
        assert!(started.rank.is_some());

        let kept = move_to(&connection, y, Destination::Current, 0).unwrap();
        assert_eq!(kept.started_at.as_deref(), Some("s"));
        assert_eq!(list_order(&connection), ["Y*", "X*"]);
    }

    #[test]
    fn move_to_backlog_clears_the_start() {
        let connection = open_in_memory();
        let y = seed(&connection, "Y", Some("8"), true);

        let moved = move_to(&connection, y, Destination::Backlog, 0).unwrap();

        assert_eq!(moved.started_at, None);
        assert!(moved.rank.is_some());
        assert_eq!(list_order(&connection), ["Y"]);
    }

    #[test]
    fn move_to_current_goes_directly_after_the_card_above_in_the_whole_list() {
        let connection = open_in_memory();
        seed(&connection, "A", Some("2"), true);
        let b = seed(&connection, "B", Some("4"), false);
        seed(&connection, "C", Some("6"), true);
        let d = seed(&connection, "D", Some("8"), false);

        move_to(&connection, d, Destination::Current, 1).unwrap();

        assert_eq!(list_order(&connection), ["A*", "D*", "B", "C*"]);
        assert_eq!(task(&connection, b).rank.as_deref(), Some("4"));
    }

    #[test]
    fn move_to_backlog_at_index_zero_goes_directly_before_the_first_backlog_card() {
        let connection = open_in_memory();
        seed(&connection, "A", Some("2"), true);
        seed(&connection, "B", Some("4"), false);
        seed(&connection, "C", Some("6"), true);
        seed(&connection, "D", Some("8"), false);
        let x = seed_icebox(&connection, "X");

        move_to(&connection, x, Destination::Backlog, 0).unwrap();

        assert_eq!(list_order(&connection), ["A*", "X", "B", "C*", "D"]);
    }

    #[test]
    fn move_to_an_empty_column_goes_to_the_end_of_the_list() {
        let connection = open_in_memory();
        seed(&connection, "A", Some("2"), true);
        seed(&connection, "B", Some("4"), true);
        let x = seed_icebox(&connection, "X");

        move_to(&connection, x, Destination::Backlog, 0).unwrap();
        assert_eq!(list_order(&connection), ["A*", "B*", "X"]);

        let connection = open_in_memory();
        seed(&connection, "A", Some("2"), false);
        seed(&connection, "B", Some("4"), false);
        let x = seed_icebox(&connection, "X");

        move_to(&connection, x, Destination::Current, 5).unwrap();
        assert_eq!(list_order(&connection), ["A", "B", "X*"]);
    }

    #[test]
    fn move_to_clamps_the_index() {
        let connection = open_in_memory();
        seed(&connection, "A", Some("4"), false);
        seed(&connection, "B", Some("8"), false);
        let x = seed_icebox(&connection, "X");
        let y = seed_icebox(&connection, "Y");

        move_to(&connection, x, Destination::Backlog, -3).unwrap();
        move_to(&connection, y, Destination::Backlog, 99).unwrap();

        assert_eq!(list_order(&connection), ["X", "A", "B", "Y"]);
    }

    #[test]
    fn move_to_icebox_clears_rank_and_start() {
        let connection = open_in_memory();
        let y = seed(&connection, "Y", Some("8"), true);

        let moved = move_to(&connection, y, Destination::Icebox, 3).unwrap();

        assert_eq!(moved.rank, None);
        assert_eq!(moved.started_at, None);
        assert_eq!(moved.completed_at, None);
    }

    #[test]
    fn move_to_done_completes_and_keeps_rank_and_start() {
        let connection = open_in_memory();
        let y = seed(&connection, "Y", Some("8"), true);

        let moved = move_to(&connection, y, Destination::Done, 0).unwrap();

        assert!(moved.completed_at.is_some());
        assert_eq!(moved.rank.as_deref(), Some("8"));
        assert_eq!(moved.started_at.as_deref(), Some("s"));
    }

    #[test]
    fn move_to_refuses_a_completed_or_deleted_task() {
        let connection = open_in_memory();
        let completed = seed(&connection, "C", Some("4"), false);
        set_column(&connection, completed, "completed_at", "c");
        let deleted = seed(&connection, "D", Some("8"), false);
        mark_deleted(&connection, "tasks", deleted);

        assert!(matches!(
            move_to(&connection, completed, Destination::Backlog, 0),
            Err(Error::Completed(id)) if id == completed
        ));
        assert!(matches!(
            move_to(&connection, deleted, Destination::Icebox, 0),
            Err(Error::Deleted(id)) if id == deleted
        ));
        assert!(matches!(
            move_to(&connection, 999, Destination::Icebox, 0),
            Err(Error::NotFound(999))
        ));
        assert_eq!(
            task(&connection, completed).completed_at.as_deref(),
            Some("c")
        );
        assert_eq!(task(&connection, deleted).rank.as_deref(), Some("8"));
    }

    #[test]
    fn move_to_writes_only_the_moved_row() {
        let connection = open_in_memory();
        seed(&connection, "A", Some("2"), true);
        seed(&connection, "B", Some("4"), false);
        seed(&connection, "C", Some("6"), true);
        let d = seed(&connection, "D", Some("8"), false);
        seed_icebox(&connection, "E");
        let others = |connection: &Connection| -> Vec<Task> {
            list(connection)
                .unwrap()
                .into_iter()
                .filter(|task| task.id != d)
                .collect()
        };
        let before = others(&connection);

        move_to(&connection, d, Destination::Current, 1).unwrap();
        move_to(&connection, d, Destination::Backlog, 0).unwrap();
        move_to(&connection, d, Destination::Icebox, 0).unwrap();
        move_to(&connection, d, Destination::Done, 0).unwrap();

        assert_eq!(others(&connection), before);
    }

    #[test]
    fn move_to_does_not_change_updated_at() {
        let connection = open_in_memory();
        let x = seed_icebox(&connection, "X");

        for destination in [
            Destination::Backlog,
            Destination::Current,
            Destination::Icebox,
            Destination::Done,
        ] {
            let moved = move_to(&connection, x, destination, 0).unwrap();
            assert_eq!(moved.updated_at, OLD_TIME);
        }
    }

    #[test]
    fn move_to_next_to_an_invalid_rank_fails_with_a_message() {
        let connection = open_in_memory();
        seed(&connection, "A", Some("zz"), false);
        let x = seed_icebox(&connection, "X");

        let result = move_to(&connection, x, Destination::Backlog, 1);

        let Err(error @ Error::Rank(_)) = result else {
            panic!("the move should fail with a rank error");
        };
        assert!(error.to_string().starts_with("invalid rank"));
        assert_eq!(task(&connection, x).rank, None);
    }

    #[test]
    fn destination_reads_lowercase_text() {
        let destinations: Vec<Destination> =
            serde_json::from_str(r#"["current", "backlog", "icebox", "done"]"#).unwrap();
        assert_eq!(
            destinations,
            [
                Destination::Current,
                Destination::Backlog,
                Destination::Icebox,
                Destination::Done
            ]
        );
    }

    #[test]
    fn start_keeps_the_rank() {
        let connection = open_in_memory();
        seed(&connection, "A", Some("2"), true);
        let b = seed(&connection, "B", Some("4"), false);
        seed(&connection, "C", Some("6"), false);

        let started = start(&connection, b).unwrap();

        assert_eq!(started.rank.as_deref(), Some("4"));
        assert!(started.started_at.is_some());
        assert_eq!(started.updated_at, OLD_TIME);
        assert_eq!(list_order(&connection), ["A*", "B*", "C"]);
    }

    #[test]
    fn start_refuses_a_task_outside_the_backlog() {
        let connection = open_in_memory();
        let icebox = seed_icebox(&connection, "I");
        let current = seed(&connection, "C", Some("4"), true);
        let done = seed(&connection, "D", Some("8"), false);
        set_column(&connection, done, "completed_at", "c");
        let deleted = seed(&connection, "X", Some("c"), false);
        mark_deleted(&connection, "tasks", deleted);

        for id in [icebox, current, done] {
            assert!(matches!(
                start(&connection, id),
                Err(Error::NotInBacklog(other)) if other == id
            ));
        }
        assert!(matches!(
            start(&connection, deleted),
            Err(Error::Deleted(id)) if id == deleted
        ));
        assert!(matches!(start(&connection, 999), Err(Error::NotFound(999))));
        assert_eq!(task(&connection, current).started_at.as_deref(), Some("s"));
        assert_eq!(task(&connection, deleted).started_at, None);
    }

    #[test]
    fn set_completed_keeps_the_first_completion_time() {
        let connection = open_in_memory();
        let x = seed(&connection, "X", Some("8"), true);

        let completed = set_completed(&connection, x, true).unwrap();
        assert!(completed.completed_at.is_some());
        assert_eq!(completed.rank.as_deref(), Some("8"));
        assert_eq!(completed.started_at.as_deref(), Some("s"));
        assert_eq!(completed.updated_at, OLD_TIME);

        set_column(&connection, x, "completed_at", OLD_TIME);
        let again = set_completed(&connection, x, true).unwrap();
        assert_eq!(again.completed_at.as_deref(), Some(OLD_TIME));

        assert!(matches!(
            set_completed(&connection, 999, true),
            Err(Error::NotFound(999))
        ));
    }

    #[test]
    fn reopen_returns_to_current_backlog_or_icebox() {
        let connection = open_in_memory();
        let current = seed(&connection, "C", Some("4"), true);
        let backlog = seed(&connection, "B", Some("8"), false);
        let icebox = seed_icebox(&connection, "I");
        for id in [current, backlog, icebox] {
            set_completed(&connection, id, true).unwrap();
        }
        let open = seed(&connection, "O", Some("6"), false);

        let reopened: Vec<Task> = [current, backlog, icebox]
            .into_iter()
            .map(|id| set_completed(&connection, id, false).unwrap())
            .collect();

        for task in &reopened {
            assert_eq!(task.completed_at, None);
            assert_eq!(task.updated_at, OLD_TIME);
        }
        assert_eq!(reopened[0].rank.as_deref(), Some("4"));
        assert_eq!(reopened[0].started_at.as_deref(), Some("s"));
        assert_eq!(reopened[1].rank.as_deref(), Some("8"));
        assert_eq!(reopened[1].started_at, None);
        assert_eq!(reopened[2].rank, None);
        assert_eq!(reopened[2].started_at, None);
        assert_eq!(list_order(&connection), ["C*", "O", "B"]);
        assert_eq!(task(&connection, open).rank.as_deref(), Some("6"));

        let unchanged = set_completed(&connection, open, false).unwrap();
        assert_eq!(unchanged, task(&connection, open));
    }

    #[test]
    fn reopen_after_the_task_that_took_the_rank() {
        let connection = open_in_memory();
        let a = seed(&connection, "A", Some("4"), false);
        set_completed(&connection, a, true).unwrap();
        seed(&connection, "B", Some("4"), true);
        seed(&connection, "C", Some("8"), false);

        let reopened = set_completed(&connection, a, false).unwrap();

        let rank = reopened.rank.unwrap();
        assert!("4" < rank.as_str() && rank.as_str() < "8");
        assert_eq!(list_order(&connection), ["B*", "A", "C"]);
    }

    #[test]
    fn set_completed_refuses_a_deleted_task() {
        let connection = open_in_memory();
        let x = seed(&connection, "X", Some("8"), false);
        mark_deleted(&connection, "tasks", x);

        for completed in [true, false] {
            assert!(matches!(
                set_completed(&connection, x, completed),
                Err(Error::Deleted(id)) if id == x
            ));
        }
        assert_eq!(task(&connection, x).completed_at, None);
    }

    #[test]
    fn delete_keeps_the_row_and_the_first_time() {
        let connection = open_in_memory();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        let created = create_for_meeting(&connection, meeting.id, "Send the deck").unwrap();
        set_column(&connection, created.id, "rank", "8");
        set_column(&connection, created.id, "started_at", "s");
        set_updated_at(&connection, created.id, OLD_TIME);

        delete(&connection, created.id).unwrap();

        let deleted = task(&connection, created.id);
        assert!(deleted.deleted_at.is_some());
        assert_eq!(deleted.rank.as_deref(), Some("8"));
        assert_eq!(deleted.started_at.as_deref(), Some("s"));
        assert_eq!(deleted.updated_at, OLD_TIME);
        assert!(list_for_meeting(&connection, meeting.id)
            .unwrap()
            .is_empty());

        set_column(&connection, created.id, "deleted_at", OLD_TIME);
        delete(&connection, created.id).unwrap();
        assert_eq!(
            task(&connection, created.id).deleted_at.as_deref(),
            Some(OLD_TIME)
        );
        assert!(matches!(
            delete(&connection, 999),
            Err(Error::NotFound(999))
        ));
    }

    #[test]
    fn restore_returns_to_the_held_place() {
        let connection = open_in_memory();
        seed(&connection, "A", Some("2"), false);
        let b = seed(&connection, "B", Some("4"), true);
        seed(&connection, "C", Some("6"), false);
        let icebox = seed_icebox(&connection, "I");
        delete(&connection, b).unwrap();
        delete(&connection, icebox).unwrap();

        let restored = restore(&connection, b).unwrap();
        let restored_icebox = restore(&connection, icebox).unwrap();

        assert_eq!(restored.deleted_at, None);
        assert_eq!(restored.rank.as_deref(), Some("4"));
        assert_eq!(restored.updated_at, OLD_TIME);
        assert_eq!(list_order(&connection), ["A", "B*", "C"]);
        assert_eq!(restored_icebox.deleted_at, None);
        assert_eq!(restored_icebox.rank, None);

        let unchanged = restore(&connection, b).unwrap();
        assert_eq!(unchanged, restored);
        assert!(matches!(
            restore(&connection, 999),
            Err(Error::NotFound(999))
        ));
    }

    #[test]
    fn restore_after_the_task_that_took_the_rank() {
        let connection = open_in_memory();
        let a = seed(&connection, "A", Some("4"), true);
        delete(&connection, a).unwrap();
        seed(&connection, "B", Some("4"), false);
        seed(&connection, "C", Some("8"), false);

        let restored = restore(&connection, a).unwrap();

        let rank = restored.rank.unwrap();
        assert!("4" < rank.as_str() && rank.as_str() < "8");
        assert_eq!(list_order(&connection), ["B", "A*", "C"]);
    }

    #[test]
    fn restore_of_a_completed_task_goes_to_done() {
        let connection = open_in_memory();
        let a = seed(&connection, "A", Some("4"), false);
        set_completed(&connection, a, true).unwrap();
        delete(&connection, a).unwrap();
        seed(&connection, "B", Some("4"), false);

        let restored = restore(&connection, a).unwrap();

        assert_eq!(restored.deleted_at, None);
        assert!(restored.completed_at.is_some());
        assert_eq!(restored.rank.as_deref(), Some("4"));
        assert_eq!(list_order(&connection), ["B"]);
    }
}
