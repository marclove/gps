//! Storage of initiatives, their place on the roadmap, and the role of the user in each one,
//! in the application database.
//!
//! An initiative is on the board when it is neither completed nor deleted. In each of the
//! columns `now`, `next`, and `later`, the initiatives on the board have the positions 0 to
//! n - 1, with no gap and no repeated number. Every function that changes the order keeps this
//! rule inside one transaction.

use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::meetings::NOW;

/// The roles of the RACI model that the user can have in an initiative, as they are stored.
pub const RACI_ROLES: [&str; 4] = ["responsible", "accountable", "consulted", "informed"];

/// The columns of the roadmap that keep an order that the user sets, as they are stored.
pub const HORIZONS: [&str; 3] = ["now", "next", "later"];

/// The destination of a move that completes an initiative.
pub const DONE: &str = "done";

/// One initiative, with its description, its place on the roadmap, and the role of the user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Initiative {
    /// The identifier that the database gives the initiative.
    pub id: i64,
    /// The name of the initiative, without spaces at the start or the end. It can be empty.
    pub name: String,
    /// The description, as Markdown.
    pub description: String,
    /// The role of the user in the initiative, one of `RACI_ROLES`, or `None` if the user did
    /// not choose a role.
    pub raci_role: Option<String>,
    /// The column of the initiative, one of `HORIZONS`. For a completed or deleted
    /// initiative, the column that it was in last.
    pub horizon: String,
    /// The place in the column, from 0 at the top. For a completed or deleted initiative, the
    /// place that it had last.
    pub position: i64,
    /// The time when the initiative was created, as an RFC 3339 timestamp in UTC.
    pub created_at: String,
    /// The time when the name, the description, or the role was last changed, as an RFC 3339
    /// timestamp in UTC.
    pub updated_at: String,
    /// The time when the initiative was completed, as an RFC 3339 timestamp in UTC, or `None`
    /// if it is not completed.
    pub completed_at: Option<String>,
    /// The time when the initiative was deleted, as an RFC 3339 timestamp in UTC, or `None`
    /// if it is not deleted.
    pub deleted_at: Option<String>,
}

/// The part of an initiative that the roadmap shows. It does not include the description.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitiativeSummary {
    /// The identifier that the database gives the initiative.
    pub id: i64,
    /// The name of the initiative, without spaces at the start or the end. It can be empty.
    pub name: String,
    /// The role of the user in the initiative, one of `RACI_ROLES`, or `None` if the user did
    /// not choose a role.
    pub raci_role: Option<String>,
    /// The column of the initiative, one of `HORIZONS`. For a completed or deleted
    /// initiative, the column that it was in last.
    pub horizon: String,
    /// The place in the column, from 0 at the top. For a completed or deleted initiative, the
    /// place that it had last.
    pub position: i64,
    /// The time when the initiative was created, as an RFC 3339 timestamp in UTC.
    pub created_at: String,
    /// The time when the name, the description, or the role was last changed, as an RFC 3339
    /// timestamp in UTC.
    pub updated_at: String,
    /// The time when the initiative was completed, as an RFC 3339 timestamp in UTC, or `None`
    /// if it is not completed.
    pub completed_at: Option<String>,
    /// The time when the initiative was deleted, as an RFC 3339 timestamp in UTC, or `None`
    /// if it is not deleted.
    pub deleted_at: Option<String>,
}

/// The result of a create.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
#[expect(
    clippy::large_enum_variant,
    reason = "each value lives only until the command sends it to the frontend"
)]
pub enum CreateOutcome {
    /// The initiative was saved.
    Created {
        /// The initiative as it is stored after the create.
        initiative: Initiative,
    },
    /// Another initiative that is not deleted has the same name. Nothing was saved.
    NameTaken,
}

/// The result of a rename.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
#[expect(
    clippy::large_enum_variant,
    reason = "each value lives only until the command sends it to the frontend"
)]
pub enum RenameOutcome {
    /// The name was saved.
    Renamed {
        /// The initiative as it is stored after the change.
        initiative: Initiative,
    },
    /// Another initiative that is not deleted has the same name. Nothing was changed.
    NameTaken,
}

/// The result of a restore of a deleted initiative.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum RestoreOutcome {
    /// The initiative is not deleted now.
    Restored,
    /// Another initiative that is not deleted has the same name. Nothing was changed, and the
    /// initiative stays deleted.
    NameTaken,
}

/// A problem that stops an initiative operation.
#[derive(Debug)]
pub enum Error {
    /// No initiative has the given identifier.
    NotFound(i64),
    /// The role is not one of `RACI_ROLES`.
    InvalidRole(String),
    /// The destination of a move is not one of `HORIZONS` or `DONE`.
    InvalidDestination(String),
    /// The initiative is deleted, so the operation cannot change it.
    Deleted(i64),
    /// The name is empty, the description is empty, and there is no role, so the user did not
    /// change the new initiative. Such an initiative is never saved.
    Unchanged,
    /// The database reported an error.
    Database(rusqlite::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NotFound(id) => write!(f, "initiative {id} not found"),
            Error::InvalidRole(role) => write!(
                f,
                "invalid RACI role \"{role}\": use responsible, accountable, consulted, or informed"
            ),
            Error::InvalidDestination(destination) => write!(
                f,
                "invalid destination \"{destination}\": use now, next, later, or done"
            ),
            Error::Deleted(id) => write!(f, "initiative {id} is deleted"),
            Error::Unchanged => write!(f, "an initiative needs a name, a description, or a role"),
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

/// The SQL condition for an initiative that is on the board.
const ON_BOARD: &str = "completed_at IS NULL AND deleted_at IS NULL";

/// Returns summaries of the initiatives. When `include_deleted` is false, leaves out the
/// deleted initiatives. The order is by column and position, but callers must not depend on
/// it.
pub fn list(
    connection: &Connection,
    include_deleted: bool,
) -> Result<Vec<InitiativeSummary>, Error> {
    let mut statement = connection.prepare(
        "SELECT id, name, raci_role, horizon, position, created_at, updated_at, completed_at,
                deleted_at
         FROM initiatives
         WHERE ?1 OR deleted_at IS NULL
         ORDER BY horizon, position, id",
    )?;
    let summaries = statement
        .query_map(params![include_deleted], |row| {
            Ok(InitiativeSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                raci_role: row.get(2)?,
                horizon: row.get(3)?,
                position: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                completed_at: row.get(7)?,
                deleted_at: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(summaries)
}

/// Creates an initiative with the given name, description, and role, at the top of the column
/// `later`. The other initiatives in `later` move down by one.
///
/// Removes the spaces at the start and the end of `name`. The role must be one of
/// `RACI_ROLES`, or `None` for no role. If the name is empty, the description is empty, and
/// the role is `None`, returns `Error::Unchanged`. If another initiative that is not deleted
/// has the same name, without regard to uppercase and lowercase letters, returns
/// `CreateOutcome::NameTaken` and saves nothing. An empty name never conflicts.
pub fn create(
    connection: &Connection,
    name: &str,
    description: &str,
    raci_role: Option<&str>,
) -> Result<CreateOutcome, Error> {
    let name = name.trim();
    check_role(raci_role)?;
    if name.is_empty() && description.is_empty() && raci_role.is_none() {
        return Err(Error::Unchanged);
    }
    let transaction = connection.unchecked_transaction()?;
    if name_is_taken(&transaction, None, name)? {
        return Ok(CreateOutcome::NameTaken);
    }
    open_gap(&transaction, "later", 0)?;
    let id = transaction.query_row(
        &format!(
            "INSERT INTO initiatives
                 (name, description, raci_role, horizon, position, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'later', 0, {NOW}, {NOW}) RETURNING id"
        ),
        params![name, description, raci_role],
        |row| row.get(0),
    )?;
    transaction.commit()?;
    let initiative = get(connection, id)?.ok_or(Error::NotFound(id))?;
    Ok(CreateOutcome::Created { initiative })
}

/// Returns the initiative with the given identifier, or `None` if no initiative has it.
pub fn get(connection: &Connection, id: i64) -> Result<Option<Initiative>, Error> {
    let initiative = connection
        .query_row(
            "SELECT id, name, description, raci_role, horizon, position, created_at, updated_at,
                    completed_at, deleted_at
             FROM initiatives WHERE id = ?1",
            params![id],
            initiative_from_row,
        )
        .optional()?;
    Ok(initiative)
}

/// Removes the spaces at the start and the end of `name`, and saves it as the name of the
/// initiative. Sets the time it was last changed. If another initiative that is not deleted
/// has the same name, without regard to uppercase and lowercase letters, returns
/// `RenameOutcome::NameTaken` and changes nothing. An empty name never conflicts.
pub fn rename(connection: &Connection, id: i64, name: &str) -> Result<RenameOutcome, Error> {
    let name = name.trim();
    if get(connection, id)?.is_none() {
        return Err(Error::NotFound(id));
    }
    if name_is_taken(connection, Some(id), name)? {
        return Ok(RenameOutcome::NameTaken);
    }
    connection.execute(
        &format!("UPDATE initiatives SET name = ?2, updated_at = {NOW} WHERE id = ?1"),
        params![id, name],
    )?;
    let initiative = get(connection, id)?.ok_or(Error::NotFound(id))?;
    Ok(RenameOutcome::Renamed { initiative })
}

/// Replaces the description and the role of an initiative, and sets the time it was last
/// changed. The role must be one of `RACI_ROLES`, or `None` for no role. Does not change the
/// name, the column, or the position. Returns the initiative as it is stored after the change.
pub fn update(
    connection: &Connection,
    id: i64,
    description: &str,
    raci_role: Option<&str>,
) -> Result<Initiative, Error> {
    check_role(raci_role)?;
    let changed = connection.execute(
        &format!(
            "UPDATE initiatives SET description = ?2, raci_role = ?3, updated_at = {NOW}
             WHERE id = ?1"
        ),
        params![id, description, raci_role],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Moves an initiative to a column of the roadmap, or completes it.
///
/// When `destination` is one of `HORIZONS`, the initiative goes to the place `index` in that
/// column, counted without the initiative. An index below 0 puts it at the top, and an index
/// larger than the column puts it at the end. A completed initiative is opened again.
///
/// When `destination` is `DONE`, the initiative is completed. It keeps its column and
/// position, and `index` is ignored. An initiative that is already completed keeps the time
/// that was recorded first, and nothing else changes.
///
/// Does not change `updated_at`. Refuses a deleted initiative.
pub fn move_to(
    connection: &Connection,
    id: i64,
    destination: &str,
    index: i64,
) -> Result<(), Error> {
    if destination != DONE && !HORIZONS.contains(&destination) {
        return Err(Error::InvalidDestination(destination.to_owned()));
    }
    let initiative = get(connection, id)?.ok_or(Error::NotFound(id))?;
    if initiative.deleted_at.is_some() {
        return Err(Error::Deleted(id));
    }
    let transaction = connection.unchecked_transaction()?;
    if initiative.completed_at.is_none() {
        close_gap(&transaction, &initiative.horizon, initiative.position)?;
    }
    if destination == DONE {
        transaction.execute(
            &format!(
                "UPDATE initiatives SET completed_at = coalesce(completed_at, {NOW})
                 WHERE id = ?1"
            ),
            params![id],
        )?;
    } else {
        place(&transaction, id, destination, index)?;
    }
    transaction.commit()?;
    Ok(())
}

/// Marks an initiative as deleted and removes it from the roadmap. The row stays in the
/// database. Records the current time as the time the initiative was deleted. The initiatives after it in its column move up by
/// one. Deleting an initiative that is already deleted keeps the time that was recorded first
/// and changes nothing else. Does not change `updated_at` or the meetings that are assigned to
/// the initiative.
pub fn delete(connection: &Connection, id: i64) -> Result<(), Error> {
    let initiative = get(connection, id)?.ok_or(Error::NotFound(id))?;
    if initiative.deleted_at.is_some() {
        return Ok(());
    }
    let transaction = connection.unchecked_transaction()?;
    if initiative.completed_at.is_none() {
        close_gap(&transaction, &initiative.horizon, initiative.position)?;
    }
    transaction.execute(
        &format!("UPDATE initiatives SET deleted_at = {NOW} WHERE id = ?1"),
        params![id],
    )?;
    transaction.commit()?;
    Ok(())
}

/// Brings a deleted initiative back. An initiative that is not completed goes back to its old
/// column at its old position, or at the end if the column is now shorter. A completed
/// initiative goes back to the completed initiatives. If another initiative that is not
/// deleted has the same name, returns `RestoreOutcome::NameTaken` and changes nothing.
/// Restoring an initiative that is not deleted changes nothing.
pub fn restore(connection: &Connection, id: i64) -> Result<RestoreOutcome, Error> {
    let initiative = get(connection, id)?.ok_or(Error::NotFound(id))?;
    if initiative.deleted_at.is_none() {
        return Ok(RestoreOutcome::Restored);
    }
    if name_is_taken(connection, Some(id), &initiative.name)? {
        return Ok(RestoreOutcome::NameTaken);
    }
    let transaction = connection.unchecked_transaction()?;
    transaction.execute(
        "UPDATE initiatives SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )?;
    if initiative.completed_at.is_none() {
        place(&transaction, id, &initiative.horizon, initiative.position)?;
    }
    transaction.commit()?;
    Ok(RestoreOutcome::Restored)
}

/// Returns `Error::InvalidRole` if `raci_role` is not one of `RACI_ROLES` and not `None`.
fn check_role(raci_role: Option<&str>) -> Result<(), Error> {
    match raci_role {
        Some(role) if !RACI_ROLES.contains(&role) => Err(Error::InvalidRole(role.to_owned())),
        _ => Ok(()),
    }
}

/// Returns true if an initiative that is not deleted has `name`, without regard to uppercase
/// and lowercase letters. The initiative `except` does not count. An empty name is never
/// taken.
fn name_is_taken(connection: &Connection, except: Option<i64>, name: &str) -> Result<bool, Error> {
    if name.is_empty() {
        return Ok(false);
    }
    let taken = connection.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM initiatives
             WHERE id IS NOT ?1 AND deleted_at IS NULL AND name = ?2 COLLATE NOCASE
         )",
        params![except, name],
        |row| row.get(0),
    )?;
    Ok(taken)
}

/// Puts the initiative `id` on the board in `horizon` at `index`, clamped to the range from 0
/// to the length of the column without the initiative. The other initiatives on the board
/// must have no gap for it when this function starts. Its own row can be at any place, because
/// this function replaces its column and position.
fn place(connection: &Connection, id: i64, horizon: &str, index: i64) -> Result<(), Error> {
    let length: i64 = connection.query_row(
        &format!("SELECT count(*) FROM initiatives WHERE horizon = ?1 AND id <> ?2 AND {ON_BOARD}"),
        params![horizon, id],
        |row| row.get(0),
    )?;
    let index = index.clamp(0, length);
    open_gap(connection, horizon, index)?;
    connection.execute(
        "UPDATE initiatives SET horizon = ?2, position = ?3, completed_at = NULL WHERE id = ?1",
        params![id, horizon, index],
    )?;
    Ok(())
}

/// Moves up by one the initiatives on the board in `horizon` that are after `position`.
fn close_gap(connection: &Connection, horizon: &str, position: i64) -> Result<(), Error> {
    connection.execute(
        &format!(
            "UPDATE initiatives SET position = position - 1
             WHERE horizon = ?1 AND position > ?2 AND {ON_BOARD}"
        ),
        params![horizon, position],
    )?;
    Ok(())
}

/// Moves down by one the initiatives on the board in `horizon` that are at or after
/// `position`.
fn open_gap(connection: &Connection, horizon: &str, position: i64) -> Result<(), Error> {
    connection.execute(
        &format!(
            "UPDATE initiatives SET position = position + 1
             WHERE horizon = ?1 AND position >= ?2 AND {ON_BOARD}"
        ),
        params![horizon, position],
    )?;
    Ok(())
}

fn initiative_from_row(row: &Row<'_>) -> rusqlite::Result<Initiative> {
    Ok(Initiative {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        raci_role: row.get(3)?,
        horizon: row.get(4)?,
        position: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        completed_at: row.get(8)?,
        deleted_at: row.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    const OLD_TIME: &str = "2000-01-01T00:00:00.000Z";

    /// Returns the names and positions of the initiatives on the board in a column, in the
    /// order of their positions.
    fn column(connection: &Connection, horizon: &str) -> Vec<(String, i64)> {
        let mut statement = connection
            .prepare(
                "SELECT name, position FROM initiatives
                 WHERE horizon = ?1 AND completed_at IS NULL AND deleted_at IS NULL
                 ORDER BY position, id",
            )
            .unwrap();
        statement
            .query_map(params![horizon], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    }

    /// Returns the names in a column, in the order of their positions.
    fn names(connection: &Connection, horizon: &str) -> Vec<String> {
        column(connection, horizon)
            .into_iter()
            .map(|(name, _)| name)
            .collect()
    }

    /// Checks that every column has the positions 0 to n - 1.
    fn assert_dense(connection: &Connection) {
        for horizon in HORIZONS {
            let positions: Vec<i64> = column(connection, horizon)
                .into_iter()
                .map(|(_, position)| position)
                .collect();
            let expected: Vec<i64> = (0..).take(positions.len()).collect();
            assert_eq!(positions, expected, "positions in {horizon}");
        }
    }

    /// Creates an initiative with the given values and returns it. Fails the test if the
    /// initiative is not created.
    fn created(
        connection: &Connection,
        name: &str,
        description: &str,
        raci_role: Option<&str>,
    ) -> Initiative {
        match create(connection, name, description, raci_role).unwrap() {
            CreateOutcome::Created { initiative } => initiative,
            CreateOutcome::NameTaken => panic!("the create should succeed"),
        }
    }

    /// Creates an initiative with the given name at the end of the given column.
    fn add(connection: &Connection, name: &str, horizon: &str) -> i64 {
        let id = created(connection, "", "x", None).id;
        assert!(matches!(
            rename(connection, id, name).unwrap(),
            RenameOutcome::Renamed { .. }
        ));
        move_to(connection, id, horizon, 99).unwrap();
        id
    }

    /// Returns the number of initiatives in the database, deleted ones included.
    fn count(connection: &Connection) -> i64 {
        connection
            .query_row("SELECT count(*) FROM initiatives", [], |row| row.get(0))
            .unwrap()
    }

    fn set_updated_at(connection: &Connection, id: i64, time: &str) {
        connection
            .execute(
                "UPDATE initiatives SET updated_at = ?2 WHERE id = ?1",
                params![id, time],
            )
            .unwrap();
    }

    fn fetch(connection: &Connection, id: i64) -> Initiative {
        get(connection, id).unwrap().unwrap()
    }

    #[test]
    fn create_puts_the_initiative_at_the_top_of_later() {
        let connection = open_in_memory();
        add(&connection, "N", "now");
        let first = created(&connection, "first", "", None);
        let second = created(&connection, "  second ", "## Goals\n", Some("consulted"));

        assert_eq!(
            column(&connection, "later"),
            vec![("second".to_owned(), 0), ("first".to_owned(), 1)]
        );
        assert_eq!(fetch(&connection, first.id).position, 1);
        assert_eq!(second.name, "second");
        assert_eq!(second.description, "## Goals\n");
        assert_eq!(second.raci_role.as_deref(), Some("consulted"));
        assert_eq!(second.horizon, "later");
        assert_eq!(second.position, 0);
        assert_eq!(second.completed_at, None);
        assert_eq!(second.deleted_at, None);
        assert_eq!(second.created_at, second.updated_at);
        assert!(second.created_at.ends_with('Z'));
        assert_eq!(fetch(&connection, second.id), second);
        assert_eq!(names(&connection, "now"), ["N"]);
        assert_dense(&connection);
    }

    #[test]
    fn create_refuses_an_initiative_that_the_user_did_not_change() {
        let connection = open_in_memory();

        for name in ["", "   "] {
            let result = create(&connection, name, "", None);
            assert!(
                matches!(result, Err(Error::Unchanged)),
                "{name:?} should be refused"
            );
        }

        assert_eq!(count(&connection), 0);
        assert_eq!(
            Error::Unchanged.to_string(),
            "an initiative needs a name, a description, or a role"
        );
    }

    #[test]
    fn create_accepts_only_a_role_or_only_a_description() {
        let connection = open_in_memory();

        let with_role = created(&connection, " ", "", Some("informed"));
        assert_eq!(with_role.name, "");
        assert_eq!(with_role.raci_role.as_deref(), Some("informed"));

        let with_description = created(&connection, "", "Notes", None);
        assert_eq!(with_description.name, "");
        assert_eq!(with_description.description, "Notes");
        assert_eq!(with_description.raci_role, None);

        assert_eq!(count(&connection), 2);
        assert_dense(&connection);
    }

    #[test]
    fn create_returns_name_taken_and_saves_nothing() {
        let connection = open_in_memory();
        add(&connection, "Launch", "later");
        let later_before = column(&connection, "later");

        assert!(matches!(
            create(&connection, " LAUNCH ", "Notes", Some("responsible")).unwrap(),
            CreateOutcome::NameTaken
        ));

        assert_eq!(count(&connection), 1);
        assert_eq!(column(&connection, "later"), later_before);
        assert_dense(&connection);
    }

    #[test]
    fn create_accepts_the_name_of_a_deleted_initiative() {
        let connection = open_in_memory();
        let old = add(&connection, "Launch", "now");
        delete(&connection, old).unwrap();

        assert_eq!(created(&connection, "launch", "", None).name, "launch");
    }

    #[test]
    fn create_refuses_an_unknown_role() {
        let connection = open_in_memory();

        for role in ["Responsible", "owner", ""] {
            assert!(
                matches!(
                    create(&connection, "Launch", "", Some(role)),
                    Err(Error::InvalidRole(ref refused)) if refused == role
                ),
                "{role} should be refused"
            );
        }
        assert_eq!(count(&connection), 0);
    }

    #[test]
    fn move_within_a_column_down_and_up() {
        let connection = open_in_memory();
        let a = add(&connection, "A", "now");
        add(&connection, "B", "now");
        add(&connection, "C", "now");

        move_to(&connection, a, "now", 2).unwrap();
        assert_eq!(names(&connection, "now"), ["B", "C", "A"]);
        assert_dense(&connection);

        move_to(&connection, a, "now", 0).unwrap();
        assert_eq!(names(&connection, "now"), ["A", "B", "C"]);
        assert_dense(&connection);
    }

    #[test]
    fn move_to_another_column_closes_and_opens_gaps() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        add(&connection, "C", "now");
        add(&connection, "X", "next");
        add(&connection, "Y", "next");

        move_to(&connection, b, "next", 1).unwrap();

        assert_eq!(names(&connection, "now"), ["A", "C"]);
        assert_eq!(names(&connection, "next"), ["X", "B", "Y"]);
        assert_dense(&connection);
    }

    #[test]
    fn move_clamps_an_index_beyond_the_column() {
        let connection = open_in_memory();
        let a = add(&connection, "A", "now");
        add(&connection, "B", "now");
        add(&connection, "X", "next");

        move_to(&connection, a, "next", 99).unwrap();
        assert_eq!(names(&connection, "next"), ["X", "A"]);
        assert_dense(&connection);

        move_to(&connection, a, "next", -5).unwrap();
        assert_eq!(names(&connection, "next"), ["A", "X"]);
        assert_dense(&connection);
    }

    #[test]
    fn move_to_done_completes_and_keeps_the_last_place() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        add(&connection, "C", "now");
        set_updated_at(&connection, b, OLD_TIME);

        move_to(&connection, b, "done", 0).unwrap();

        let completed = fetch(&connection, b);
        let completed_at = completed.completed_at.clone().unwrap();
        assert_eq!(completed.horizon, "now");
        assert_eq!(completed.position, 1);
        assert_eq!(completed.updated_at, OLD_TIME);
        assert_eq!(names(&connection, "now"), ["A", "C"]);
        assert_dense(&connection);

        connection
            .execute(
                "UPDATE initiatives SET completed_at = ?2 WHERE id = ?1",
                params![b, OLD_TIME],
            )
            .unwrap();
        move_to(&connection, b, "done", 0).unwrap();
        let again = fetch(&connection, b);
        assert_eq!(again.completed_at.as_deref(), Some(OLD_TIME));
        assert_ne!(completed_at, OLD_TIME);
        assert_eq!(again.horizon, "now");
        assert_eq!(again.position, 1);
        assert_eq!(names(&connection, "now"), ["A", "C"]);
        assert_dense(&connection);
    }

    #[test]
    fn move_out_of_done_reopens_at_the_index() {
        let connection = open_in_memory();
        let a = add(&connection, "A", "now");
        add(&connection, "X", "next");
        add(&connection, "Y", "next");
        move_to(&connection, a, "done", 0).unwrap();

        move_to(&connection, a, "next", 1).unwrap();

        let reopened = fetch(&connection, a);
        assert_eq!(reopened.completed_at, None);
        assert_eq!(names(&connection, "now"), Vec::<String>::new());
        assert_eq!(names(&connection, "next"), ["X", "A", "Y"]);
        assert_dense(&connection);
    }

    #[test]
    fn move_refuses_a_deleted_initiative_and_an_unknown_destination() {
        let connection = open_in_memory();
        let a = add(&connection, "A", "now");
        let b = add(&connection, "B", "now");

        for destination in ["Now", "later ", "deleted", ""] {
            assert!(
                matches!(
                    move_to(&connection, a, destination, 0),
                    Err(Error::InvalidDestination(ref refused)) if refused == destination
                ),
                "{destination} should be refused"
            );
        }

        delete(&connection, b).unwrap();
        assert!(matches!(
            move_to(&connection, b, "next", 0),
            Err(Error::Deleted(id)) if id == b
        ));
        assert!(matches!(
            move_to(&connection, b, "done", 0),
            Err(Error::Deleted(id)) if id == b
        ));
        let stored = fetch(&connection, b);
        assert_eq!(stored.horizon, "now");
        assert_eq!(stored.completed_at, None);
        assert_eq!(names(&connection, "now"), ["A"]);
        assert_eq!(names(&connection, "next"), Vec::<String>::new());
        assert_dense(&connection);
    }

    #[test]
    fn delete_closes_the_gap_and_restore_puts_it_back() {
        let connection = open_in_memory();
        add(&connection, "A", "next");
        let b = add(&connection, "B", "next");
        add(&connection, "C", "next");
        set_updated_at(&connection, b, OLD_TIME);

        delete(&connection, b).unwrap();
        let deleted = fetch(&connection, b);
        assert!(deleted.deleted_at.is_some());
        assert_eq!(deleted.updated_at, OLD_TIME);
        assert_eq!(names(&connection, "next"), ["A", "C"]);
        assert_dense(&connection);

        assert!(matches!(
            restore(&connection, b).unwrap(),
            RestoreOutcome::Restored
        ));
        let restored = fetch(&connection, b);
        assert_eq!(restored.deleted_at, None);
        assert_eq!(restored.updated_at, OLD_TIME);
        assert_eq!(names(&connection, "next"), ["A", "B", "C"]);
        assert_dense(&connection);
    }

    #[test]
    fn restore_into_a_shorter_column_puts_it_last() {
        let connection = open_in_memory();
        let a = add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        let c = add(&connection, "C", "now");

        delete(&connection, c).unwrap();
        move_to(&connection, a, "next", 0).unwrap();
        move_to(&connection, b, "done", 0).unwrap();
        add(&connection, "D", "now");

        restore(&connection, c).unwrap();

        assert_eq!(names(&connection, "now"), ["D", "C"]);
        assert_dense(&connection);
    }

    #[test]
    fn delete_of_a_completed_initiative_changes_no_column() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        add(&connection, "C", "now");
        move_to(&connection, b, "done", 0).unwrap();
        let before = fetch(&connection, b);

        delete(&connection, b).unwrap();
        assert_eq!(names(&connection, "now"), ["A", "C"]);
        assert_dense(&connection);

        assert!(matches!(
            restore(&connection, b).unwrap(),
            RestoreOutcome::Restored
        ));
        let restored = fetch(&connection, b);
        assert_eq!(restored.completed_at, before.completed_at);
        assert_eq!(restored.deleted_at, None);
        assert_eq!(names(&connection, "now"), ["A", "C"]);
        assert_dense(&connection);
    }

    #[test]
    fn rename_trims_and_saves() {
        let connection = open_in_memory();
        let id = created(&connection, "", "x", None).id;
        set_updated_at(&connection, id, OLD_TIME);

        let RenameOutcome::Renamed { initiative } = rename(&connection, id, "  Launch ").unwrap()
        else {
            panic!("the rename should succeed");
        };

        assert_eq!(initiative.name, "Launch");
        assert_ne!(initiative.updated_at, OLD_TIME);
        assert_eq!(fetch(&connection, id), initiative);
    }

    #[test]
    fn rename_returns_name_taken_for_the_same_name_in_another_case() {
        let connection = open_in_memory();
        add(&connection, "Launch", "now");
        let other = add(&connection, "Other", "now");
        set_updated_at(&connection, other, OLD_TIME);
        let before = fetch(&connection, other);

        assert!(matches!(
            rename(&connection, other, " LAUNCH  ").unwrap(),
            RenameOutcome::NameTaken
        ));

        assert_eq!(fetch(&connection, other), before);
    }

    #[test]
    fn rename_to_own_name_in_another_case_is_allowed() {
        let connection = open_in_memory();
        let id = add(&connection, "launch", "now");

        let RenameOutcome::Renamed { initiative } = rename(&connection, id, "Launch").unwrap()
        else {
            panic!("the rename should succeed");
        };

        assert_eq!(initiative.name, "Launch");
    }

    #[test]
    fn names_of_deleted_initiatives_can_be_used_again() {
        let connection = open_in_memory();
        let old = add(&connection, "Launch", "now");
        delete(&connection, old).unwrap();
        let new = add(&connection, "Other", "now");

        assert!(matches!(
            rename(&connection, new, "launch").unwrap(),
            RenameOutcome::Renamed { .. }
        ));
    }

    #[test]
    fn completed_initiatives_keep_their_names() {
        let connection = open_in_memory();
        let done = add(&connection, "Launch", "now");
        move_to(&connection, done, "done", 0).unwrap();
        let other = add(&connection, "Other", "now");

        assert!(matches!(
            rename(&connection, other, "Launch").unwrap(),
            RenameOutcome::NameTaken
        ));
    }

    #[test]
    fn empty_names_do_not_conflict() {
        let connection = open_in_memory();
        let first = add(&connection, "First", "now");
        let second = add(&connection, "Second", "now");

        for id in [first, second] {
            let RenameOutcome::Renamed { initiative } = rename(&connection, id, "   ").unwrap()
            else {
                panic!("the rename should succeed");
            };
            assert_eq!(initiative.name, "");
        }
    }

    #[test]
    fn restore_returns_name_taken_when_the_name_is_used() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let old = add(&connection, "Launch", "now");
        delete(&connection, old).unwrap();
        add(&connection, "LAUNCH", "now");
        let before = fetch(&connection, old);
        let now_before = column(&connection, "now");

        assert!(matches!(
            restore(&connection, old).unwrap(),
            RestoreOutcome::NameTaken
        ));

        assert_eq!(fetch(&connection, old), before);
        assert_eq!(column(&connection, "now"), now_before);
        assert_dense(&connection);
    }

    #[test]
    fn the_database_refuses_a_second_active_initiative_with_the_same_name() {
        let connection = open_in_memory();
        add(&connection, "Launch", "now");
        let other = add(&connection, "Other", "now");
        let deleted = add(&connection, "Deleted", "now");
        delete(&connection, deleted).unwrap();

        let result = connection.execute(
            "UPDATE initiatives SET name = 'launch' WHERE id = ?1",
            params![other],
        );
        assert!(result.is_err());

        connection
            .execute(
                "UPDATE initiatives SET name = 'LAUNCH' WHERE id = ?1",
                params![deleted],
            )
            .unwrap();
        let result = connection.execute(
            "UPDATE initiatives SET deleted_at = NULL WHERE id = ?1",
            params![deleted],
        );
        assert!(result.is_err());
    }

    #[test]
    fn update_saves_the_description_and_role_only() {
        let connection = open_in_memory();
        add(&connection, "A", "next");
        let id = add(&connection, "Launch", "next");
        set_updated_at(&connection, id, OLD_TIME);
        let before = fetch(&connection, id);

        let updated = update(&connection, id, "## Goals\n", Some("accountable")).unwrap();

        assert_eq!(updated.description, "## Goals\n");
        assert_eq!(updated.raci_role.as_deref(), Some("accountable"));
        assert_eq!(updated.name, "Launch");
        assert_eq!(updated.horizon, "next");
        assert_eq!(updated.position, 1);
        assert_eq!(updated.created_at, before.created_at);
        assert_ne!(updated.updated_at, OLD_TIME);
        assert_eq!(fetch(&connection, id), updated);

        let cleared = update(&connection, id, "", None).unwrap();
        assert_eq!(cleared.raci_role, None);
    }

    #[test]
    fn update_refuses_an_unknown_role() {
        let connection = open_in_memory();
        let created = created(&connection, "", "x", None);

        for role in ["Responsible", "owner", ""] {
            assert!(
                matches!(
                    update(&connection, created.id, "x", Some(role)),
                    Err(Error::InvalidRole(ref refused)) if refused == role
                ),
                "{role} should be refused"
            );
        }
        assert_eq!(fetch(&connection, created.id), created);
    }

    #[test]
    fn the_database_refuses_unknown_roles_and_horizons() {
        let connection = open_in_memory();
        for (role, horizon) in [
            ("owner", "now"),
            ("Responsible", "now"),
            ("informed", "done"),
        ] {
            let result = connection.execute(
                "INSERT INTO initiatives (raci_role, horizon, position, created_at, updated_at)
                 VALUES (?1, ?2, 0, 't', 't')",
                params![role, horizon],
            );
            assert!(result.is_err(), "{role} in {horizon} should be refused");
        }
    }

    #[test]
    fn list_leaves_out_deleted_initiatives_unless_asked() {
        let connection = open_in_memory();
        let kept = add(&connection, "Kept", "now");
        let done = add(&connection, "Done", "now");
        move_to(&connection, done, "done", 0).unwrap();
        let deleted = add(&connection, "Deleted", "next");
        delete(&connection, deleted).unwrap();

        let mut visible: Vec<i64> = list(&connection, false)
            .unwrap()
            .iter()
            .map(|summary| summary.id)
            .collect();
        visible.sort_unstable();
        assert_eq!(visible, vec![kept, done]);

        let all = list(&connection, true).unwrap();
        assert_eq!(all.len(), 3);
        let summary = all.iter().find(|summary| summary.id == deleted).unwrap();
        let stored = fetch(&connection, deleted);
        assert_eq!(summary.name, stored.name);
        assert_eq!(summary.horizon, stored.horizon);
        assert_eq!(summary.position, stored.position);
        assert_eq!(summary.deleted_at, stored.deleted_at);
        assert_eq!(summary.completed_at, None);
    }

    #[test]
    fn operations_on_a_missing_initiative_return_not_found() {
        let connection = open_in_memory();
        assert_eq!(get(&connection, 999).unwrap(), None);
        assert!(matches!(
            rename(&connection, 999, "x"),
            Err(Error::NotFound(999))
        ));
        assert!(matches!(
            update(&connection, 999, "", None),
            Err(Error::NotFound(999))
        ));
        assert!(matches!(
            move_to(&connection, 999, "now", 0),
            Err(Error::NotFound(999))
        ));
        assert!(matches!(
            delete(&connection, 999),
            Err(Error::NotFound(999))
        ));
        assert!(matches!(
            restore(&connection, 999),
            Err(Error::NotFound(999))
        ));
    }

    #[test]
    fn error_messages_name_the_problem() {
        assert_eq!(Error::NotFound(7).to_string(), "initiative 7 not found");
        assert_eq!(
            Error::InvalidRole("owner".to_owned()).to_string(),
            "invalid RACI role \"owner\": use responsible, accountable, consulted, or informed"
        );
        assert_eq!(
            Error::InvalidDestination("up".to_owned()).to_string(),
            "invalid destination \"up\": use now, next, later, or done"
        );
        assert_eq!(Error::Deleted(7).to_string(), "initiative 7 is deleted");
    }
}
