//! Storage of initiatives, their place on the roadmap, and the role of the user in each one,
//! in the application database.
//!
//! An initiative is on the board when it is neither completed nor deleted. Each initiative has a
//! rank, a text key from `crate::rank`. In each of the columns `now`, `next`, and `later`, the
//! initiatives on the board sort from the top in the order of their ranks, compared as text, and
//! no two of them have the same rank. A unique index in the database enforces this rule. A
//! move, a complete, a delete, and a restore each change only one initiative.
//!
//! Each initiative belongs to one project. Its name is unique among the initiatives of that
//! project that are not deleted. Every initiative that is not deleted belongs to a project that
//! is not deleted. The meetings that cover an initiative are about its project.

use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::meetings::NOW;
use crate::{projects, rank};

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
    /// The identifier of the project that the initiative belongs to.
    pub project_id: i64,
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
    /// The key that gives the place in the column. Initiatives sort from the top in the order
    /// of their ranks, compared as text. A completed or deleted initiative keeps the rank that
    /// it had last.
    pub rank: String,
    /// The time when the initiative was created, as an RFC 3339 timestamp in UTC.
    pub created_at: String,
    /// The time when the name, the description, the role, or the project was last changed, as
    /// an RFC 3339 timestamp in UTC.
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
    /// The identifier of the project that the initiative belongs to.
    pub project_id: i64,
    /// The name of the initiative, without spaces at the start or the end. It can be empty.
    pub name: String,
    /// The role of the user in the initiative, one of `RACI_ROLES`, or `None` if the user did
    /// not choose a role.
    pub raci_role: Option<String>,
    /// The column of the initiative, one of `HORIZONS`. For a completed or deleted
    /// initiative, the column that it was in last.
    pub horizon: String,
    /// The key that gives the place in the column. Initiatives sort from the top in the order
    /// of their ranks, compared as text. A completed or deleted initiative keeps the rank that
    /// it had last.
    pub rank: String,
    /// The time when the initiative was created, as an RFC 3339 timestamp in UTC.
    pub created_at: String,
    /// The time when the name, the description, the role, or the project was last changed, as
    /// an RFC 3339 timestamp in UTC.
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
    /// Another initiative of the project that is not deleted has the same name. Nothing was
    /// saved.
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
    /// Another initiative of the project that is not deleted has the same name. Nothing was
    /// changed.
    NameTaken,
}

/// The result of a move of an initiative to another project.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
#[expect(
    clippy::large_enum_variant,
    reason = "each value lives only until the command sends it to the frontend"
)]
pub enum MoveOutcome {
    /// The initiative belongs to the other project now. Each meeting that covered only this
    /// initiative moved with it. Each other meeting that covered it stays and no longer covers it.
    Moved {
        /// The initiative as it is stored after the move.
        initiative: Initiative,
    },
    /// An initiative of the other project that is not deleted has the same name. Nothing was
    /// changed.
    NameTaken,
}

/// The result of a restore of a deleted initiative.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum RestoreOutcome {
    /// The initiative is not deleted now.
    Restored,
    /// Another initiative of the project that is not deleted has the same name. Nothing was
    /// changed, and the initiative stays deleted.
    NameTaken,
    /// The project of the initiative is deleted. Nothing was changed, and the initiative stays
    /// deleted.
    ProjectDeleted,
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
    /// No project has the given identifier.
    ProjectNotFound(i64),
    /// The project with the given identifier is deleted, so it cannot take an initiative.
    ProjectDeleted(i64),
    /// The name is empty, the description is empty, and there is no role, so the user did not
    /// change the new initiative. Such an initiative is never saved.
    Unchanged,
    /// A stored rank is not a valid rank key, so no rank can be made next to it.
    Rank(rank::Error),
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
            Error::ProjectNotFound(id) => write!(f, "project {id} not found"),
            Error::ProjectDeleted(id) => write!(f, "project {id} is deleted"),
            Error::Unchanged => write!(f, "an initiative needs a name, a description, or a role"),
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

/// The SQL condition for an initiative that is on the board.
const ON_BOARD: &str = "completed_at IS NULL AND deleted_at IS NULL";

/// Returns summaries of the initiatives. When `include_deleted` is false, leaves out the
/// deleted initiatives. The order is by column and rank, but callers must not depend on it.
pub fn list(
    connection: &Connection,
    include_deleted: bool,
) -> Result<Vec<InitiativeSummary>, Error> {
    let mut statement = connection.prepare(
        "SELECT id, project_id, name, raci_role, horizon, rank, created_at, updated_at,
                completed_at, deleted_at
         FROM initiatives
         WHERE ?1 OR deleted_at IS NULL
         ORDER BY horizon, rank, id",
    )?;
    let summaries = statement
        .query_map(params![include_deleted], |row| {
            Ok(InitiativeSummary {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                raci_role: row.get(3)?,
                horizon: row.get(4)?,
                rank: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                completed_at: row.get(8)?,
                deleted_at: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(summaries)
}

/// Creates an initiative in the project `project_id` with the given name, description, and
/// role, at the top of the column `later`. It gets a rank before the ranks of all initiatives on
/// the board in `later`. No other initiative changes.
///
/// Removes the spaces at the start and the end of `name`. The role must be one of
/// `RACI_ROLES`, or `None` for no role. If the name is empty, the description is empty, and
/// the role is `None`, returns `Error::Unchanged`. The project must exist and must not be
/// deleted. If another initiative of the project that is not deleted has the same name, without
/// regard to uppercase and lowercase letters, returns `CreateOutcome::NameTaken` and saves
/// nothing. An empty name never conflicts.
pub fn create(
    connection: &Connection,
    project_id: i64,
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
    check_project(&transaction, project_id)?;
    if name_is_taken(&transaction, project_id, None, name)? {
        return Ok(CreateOutcome::NameTaken);
    }
    let first = board_ranks(&transaction, "later", None)?.into_iter().next();
    let rank = rank::between(None, first.as_deref())?;
    let id = transaction.query_row(
        &format!(
            "INSERT INTO initiatives
                 (project_id, name, description, raci_role, horizon, rank, created_at,
                  updated_at)
             VALUES (?1, ?2, ?3, ?4, 'later', ?5, {NOW}, {NOW}) RETURNING id"
        ),
        params![project_id, name, description, raci_role, rank],
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
            "SELECT id, project_id, name, description, raci_role, horizon, rank, created_at,
                    updated_at, completed_at, deleted_at
             FROM initiatives WHERE id = ?1",
            params![id],
            initiative_from_row,
        )
        .optional()?;
    Ok(initiative)
}

/// Removes the spaces at the start and the end of `name`, and saves it as the name of the
/// initiative. Sets the time it was last changed. If another initiative of the same project that
/// is not deleted has the same name, without regard to uppercase and lowercase letters, returns
/// `RenameOutcome::NameTaken` and changes nothing. An empty name never conflicts.
pub fn rename(connection: &Connection, id: i64, name: &str) -> Result<RenameOutcome, Error> {
    let name = name.trim();
    let transaction = connection.unchecked_transaction()?;
    let initiative = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    if name_is_taken(&transaction, initiative.project_id, Some(id), name)? {
        return Ok(RenameOutcome::NameTaken);
    }
    transaction.execute(
        &format!("UPDATE initiatives SET name = ?2, updated_at = {NOW} WHERE id = ?1"),
        params![id, name],
    )?;
    transaction.commit()?;
    let initiative = get(connection, id)?.ok_or(Error::NotFound(id))?;
    Ok(RenameOutcome::Renamed { initiative })
}

/// Replaces the description and the role of an initiative, and sets the time it was last
/// changed. The role must be one of `RACI_ROLES`, or `None` for no role. Does not change the
/// name, the column, or the rank. Returns the initiative as it is stored after the change.
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

/// The SQL query for the identifiers of the meetings that cover the initiative `?1` and also
/// cover another initiative. The other initiative can be completed or deleted.
const MEETINGS_WITH_ANOTHER_INITIATIVE: &str = "
    SELECT meeting_id FROM meeting_initiatives AS this
    WHERE this.initiative_id = ?1
      AND EXISTS (SELECT 1 FROM meeting_initiatives AS other
                  WHERE other.meeting_id = this.meeting_id
                    AND other.initiative_id <> ?1)";

/// Moves an initiative to the project `project_id`, and keeps each meeting that covers the
/// initiative in one project with all of its initiatives.
///
/// A meeting that covers only this initiative moves to the project too, and still covers the
/// initiative. A meeting that also covers another initiative, also a completed or deleted one,
/// stays in its project and stops covering this initiative. Sets the time each of these
/// meetings was last changed.
///
/// Sets the time the initiative was last changed. Does not change the column or the rank, so
/// the initiative keeps its place on the roadmap. If the initiative already belongs to the
/// project, changes nothing.
///
/// Refuses a deleted initiative. The project must exist and must not be deleted, also when the
/// initiative already belongs to it. If an initiative of the project that is not deleted has
/// the same name, without regard to uppercase and lowercase letters, returns
/// `MoveOutcome::NameTaken` and changes nothing. An empty name never conflicts.
pub fn set_project(
    connection: &Connection,
    id: i64,
    project_id: i64,
) -> Result<MoveOutcome, Error> {
    let transaction = connection.unchecked_transaction()?;
    let initiative = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    if initiative.deleted_at.is_some() {
        return Err(Error::Deleted(id));
    }
    check_project(&transaction, project_id)?;
    if initiative.project_id == project_id {
        return Ok(MoveOutcome::Moved { initiative });
    }
    if name_is_taken(&transaction, project_id, Some(id), &initiative.name)? {
        return Ok(MoveOutcome::NameTaken);
    }
    transaction.execute(
        &format!("UPDATE initiatives SET project_id = ?2, updated_at = {NOW} WHERE id = ?1"),
        params![id, project_id],
    )?;
    transaction.execute(
        &format!(
            "UPDATE meetings SET updated_at = {NOW}
             WHERE id IN ({MEETINGS_WITH_ANOTHER_INITIATIVE})"
        ),
        params![id],
    )?;
    transaction.execute(
        &format!(
            "DELETE FROM meeting_initiatives
             WHERE initiative_id = ?1 AND meeting_id IN ({MEETINGS_WITH_ANOTHER_INITIATIVE})"
        ),
        params![id],
    )?;
    transaction.execute(
        &format!(
            "UPDATE meetings SET project_id = ?2, updated_at = {NOW}
             WHERE id IN (SELECT meeting_id FROM meeting_initiatives WHERE initiative_id = ?1)"
        ),
        params![id, project_id],
    )?;
    transaction.commit()?;
    let initiative = get(connection, id)?.ok_or(Error::NotFound(id))?;
    Ok(MoveOutcome::Moved { initiative })
}

/// Moves an initiative to a column of the roadmap, or completes it.
///
/// When `destination` is one of `HORIZONS`, the initiative goes to the place `index` in that
/// column, counted without the initiative. An index below 0 puts it at the top, and an index
/// larger than the column puts it at the end. The initiative gets a rank between the ranks of
/// the initiatives before and after that place. A completed initiative is opened again. If a
/// neighbor has a rank that is not valid, returns `Error::Rank` and changes nothing.
///
/// When `destination` is `DONE`, the initiative is completed. It keeps its column and rank,
/// and `index` is ignored. An initiative that is already completed keeps the time that was
/// recorded first, and nothing else changes.
///
/// No other initiative changes. Does not change `updated_at`. Refuses a deleted initiative.
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
    if destination == DONE {
        connection.execute(
            &format!(
                "UPDATE initiatives SET completed_at = coalesce(completed_at, {NOW})
                 WHERE id = ?1"
            ),
            params![id],
        )?;
    } else {
        let transaction = connection.unchecked_transaction()?;
        place(&transaction, id, destination, index)?;
        transaction.commit()?;
    }
    Ok(())
}

/// Marks an initiative as deleted and removes it from the roadmap. The row stays in the
/// database, with its column and rank. Records the current time as the time the initiative was
/// deleted. No other initiative changes. Deleting an initiative that is already deleted keeps
/// the time that was recorded first and changes nothing else. Does not change `updated_at` or
/// the meetings that cover the initiative.
pub fn delete(connection: &Connection, id: i64) -> Result<(), Error> {
    let initiative = get(connection, id)?.ok_or(Error::NotFound(id))?;
    if initiative.deleted_at.is_some() {
        return Ok(());
    }
    connection.execute(
        &format!("UPDATE initiatives SET deleted_at = {NOW} WHERE id = ?1"),
        params![id],
    )?;
    Ok(())
}

/// Brings a deleted initiative back. No other initiative changes.
///
/// An initiative that is not completed goes back to its old column with its old rank, among the
/// initiatives that were around it. If an initiative on the board in that column has the same
/// rank now, the restored initiative gets a rank between that rank and the next rank in the
/// column, so it comes directly after that initiative. A completed initiative goes back to the
/// completed initiatives.
///
/// If the project of the initiative is deleted, returns `RestoreOutcome::ProjectDeleted` and
/// changes nothing. If another initiative of the project that is not deleted has the same name,
/// returns `RestoreOutcome::NameTaken` and changes nothing. Restoring an initiative that is not
/// deleted changes nothing.
pub fn restore(connection: &Connection, id: i64) -> Result<RestoreOutcome, Error> {
    let transaction = connection.unchecked_transaction()?;
    let initiative = get(&transaction, id)?.ok_or(Error::NotFound(id))?;
    if initiative.deleted_at.is_none() {
        return Ok(RestoreOutcome::Restored);
    }
    if !projects::project_is_active(&transaction, initiative.project_id)? {
        return Ok(RestoreOutcome::ProjectDeleted);
    }
    if name_is_taken(
        &transaction,
        initiative.project_id,
        Some(id),
        &initiative.name,
    )? {
        return Ok(RestoreOutcome::NameTaken);
    }
    let mut rank = initiative.rank;
    if initiative.completed_at.is_none() {
        let ranks = board_ranks(&transaction, &initiative.horizon, Some(id))?;
        if ranks.contains(&rank) {
            let next = ranks.iter().find(|other| **other > rank);
            rank = rank::between(Some(&rank), next.map(String::as_str))?;
        }
    }
    transaction.execute(
        "UPDATE initiatives SET deleted_at = NULL, rank = ?2 WHERE id = ?1",
        params![id, rank],
    )?;
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

/// Returns `Error::ProjectNotFound` if no project has the identifier `project_id`, and
/// `Error::ProjectDeleted` if the project is deleted.
fn check_project(connection: &Connection, project_id: i64) -> Result<(), Error> {
    if projects::project_is_active(connection, project_id)? {
        Ok(())
    } else if projects::project_exists(connection, project_id)? {
        Err(Error::ProjectDeleted(project_id))
    } else {
        Err(Error::ProjectNotFound(project_id))
    }
}

/// Returns true if an initiative of the project `project_id` that is not deleted has `name`,
/// without regard to uppercase and lowercase letters. The initiative `except` does not count. An
/// empty name is never taken.
fn name_is_taken(
    connection: &Connection,
    project_id: i64,
    except: Option<i64>,
    name: &str,
) -> Result<bool, Error> {
    if name.is_empty() {
        return Ok(false);
    }
    let taken = connection.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM initiatives
             WHERE project_id = ?1 AND id IS NOT ?2 AND deleted_at IS NULL
                   AND name = ?3 COLLATE NOCASE
         )",
        params![project_id, except, name],
        |row| row.get(0),
    )?;
    Ok(taken)
}

/// Puts the initiative `id` on the board in `horizon` at `index`, clamped to the range from 0
/// to the length of the column without the initiative. Gives it a rank between the ranks of
/// its new neighbors, and opens it again if it is completed. Changes no other initiative.
fn place(connection: &Connection, id: i64, horizon: &str, index: i64) -> Result<(), Error> {
    let ranks = board_ranks(connection, horizon, Some(id))?;
    let index = usize::try_from(index).unwrap_or(0).min(ranks.len());
    let before = index.checked_sub(1).map(|before| ranks[before].as_str());
    let after = ranks.get(index).map(String::as_str);
    let rank = rank::between(before, after)?;
    connection.execute(
        "UPDATE initiatives SET horizon = ?2, rank = ?3, completed_at = NULL WHERE id = ?1",
        params![id, horizon, rank],
    )?;
    Ok(())
}

/// Returns the ranks of the initiatives on the board in `horizon`, in their order. The
/// initiative `except` does not count.
fn board_ranks(
    connection: &Connection,
    horizon: &str,
    except: Option<i64>,
) -> Result<Vec<String>, Error> {
    let ranks = connection
        .prepare(&format!(
            "SELECT rank FROM initiatives
             WHERE horizon = ?1 AND id IS NOT ?2 AND {ON_BOARD}
             ORDER BY rank"
        ))?
        .query_map(params![horizon, except], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ranks)
}

fn initiative_from_row(row: &Row<'_>) -> rusqlite::Result<Initiative> {
    Ok(Initiative {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        description: row.get(3)?,
        raci_role: row.get(4)?,
        horizon: row.get(5)?,
        rank: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        completed_at: row.get(9)?,
        deleted_at: row.get(10)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::{meetings, projects};

    const OLD_TIME: &str = "2000-01-01T00:00:00.000Z";

    /// Returns the names and ranks of the initiatives on the board in a column, in the order
    /// of their ranks.
    fn column(connection: &Connection, horizon: &str) -> Vec<(String, String)> {
        let mut statement = connection
            .prepare(
                "SELECT name, rank FROM initiatives
                 WHERE horizon = ?1 AND completed_at IS NULL AND deleted_at IS NULL
                 ORDER BY rank, id",
            )
            .unwrap();
        statement
            .query_map(params![horizon], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    }

    /// Returns the names in a column, in the order of their ranks.
    fn names(connection: &Connection, horizon: &str) -> Vec<String> {
        column(connection, horizon)
            .into_iter()
            .map(|(name, _)| name)
            .collect()
    }

    /// The stored values of one initiative that decide its place: the identifier, the rank,
    /// the column, the time it was completed, and the time it was deleted.
    type Place = (i64, String, String, Option<String>, Option<String>);

    /// Returns the place of every initiative, deleted ones included, in the order of their
    /// identifiers.
    fn places(connection: &Connection) -> Vec<Place> {
        connection
            .prepare(
                "SELECT id, rank, horizon, completed_at, deleted_at FROM initiatives ORDER BY id",
            )
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    }

    /// Sets the rank of an initiative with SQL, without the checks of this module.
    fn set_rank(connection: &Connection, id: i64, rank: &str) -> rusqlite::Result<usize> {
        connection.execute(
            "UPDATE initiatives SET rank = ?2 WHERE id = ?1",
            params![id, rank],
        )
    }

    /// Creates an initiative with the given values and returns it. Fails the test if the
    /// initiative is not created.
    fn created(
        connection: &Connection,
        name: &str,
        description: &str,
        raci_role: Option<&str>,
    ) -> Initiative {
        created_in(connection, home(connection), name, description, raci_role)
    }

    /// Creates an initiative in the given project and returns it. Fails the test if the
    /// initiative is not created.
    fn created_in(
        connection: &Connection,
        project_id: i64,
        name: &str,
        description: &str,
        raci_role: Option<&str>,
    ) -> Initiative {
        match create(connection, project_id, name, description, raci_role).unwrap() {
            CreateOutcome::Created { initiative } => initiative,
            CreateOutcome::NameTaken => panic!("the create should succeed"),
        }
    }

    /// Creates a project with the given name and returns its identifier.
    fn project(connection: &Connection, name: &str) -> i64 {
        match projects::create(connection, name, "").unwrap() {
            projects::CreateOutcome::Created { project } => project.id,
            projects::CreateOutcome::NameTaken => panic!("the create should succeed"),
        }
    }

    /// Returns the identifier of the project "Home", which most tests use. Creates the project
    /// if it does not exist.
    fn home(connection: &Connection) -> i64 {
        connection
            .query_row("SELECT id FROM projects WHERE name = 'Home'", [], |row| {
                row.get(0)
            })
            .optional()
            .unwrap()
            .unwrap_or_else(|| project(connection, "Home"))
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

        assert_eq!(names(&connection, "later"), ["second", "first"]);
        assert_eq!(fetch(&connection, first.id).rank, first.rank);
        assert!(second.rank < first.rank);
        assert_eq!(second.name, "second");
        assert_eq!(second.description, "## Goals\n");
        assert_eq!(second.raci_role.as_deref(), Some("consulted"));
        assert_eq!(second.horizon, "later");
        assert_eq!(second.completed_at, None);
        assert_eq!(second.deleted_at, None);
        assert_eq!(second.created_at, second.updated_at);
        assert!(second.created_at.ends_with('Z'));
        assert_eq!(fetch(&connection, second.id), second);
        assert_eq!(names(&connection, "now"), ["N"]);
    }

    #[test]
    fn create_refuses_an_initiative_that_the_user_did_not_change() {
        let connection = open_in_memory();

        for name in ["", "   "] {
            let result = create(&connection, home(&connection), name, "", None);
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
    }

    #[test]
    fn create_returns_name_taken_and_saves_nothing() {
        let connection = open_in_memory();
        add(&connection, "Launch", "later");
        let later_before = column(&connection, "later");

        assert!(matches!(
            create(
                &connection,
                home(&connection),
                " LAUNCH ",
                "Notes",
                Some("responsible")
            )
            .unwrap(),
            CreateOutcome::NameTaken
        ));

        assert_eq!(count(&connection), 1);
        assert_eq!(column(&connection, "later"), later_before);
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
                    create(&connection, home(&connection), "Launch", "", Some(role)),
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

        move_to(&connection, a, "now", 0).unwrap();
        assert_eq!(names(&connection, "now"), ["A", "B", "C"]);
    }

    #[test]
    fn move_to_another_column_puts_it_between_the_neighbors() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        add(&connection, "C", "now");
        add(&connection, "X", "next");
        add(&connection, "Y", "next");

        move_to(&connection, b, "next", 1).unwrap();

        assert_eq!(names(&connection, "now"), ["A", "C"]);
        assert_eq!(names(&connection, "next"), ["X", "B", "Y"]);
    }

    #[test]
    fn move_clamps_an_index_beyond_the_column() {
        let connection = open_in_memory();
        let a = add(&connection, "A", "now");
        add(&connection, "B", "now");
        add(&connection, "X", "next");

        move_to(&connection, a, "next", 99).unwrap();
        assert_eq!(names(&connection, "next"), ["X", "A"]);

        move_to(&connection, a, "next", -5).unwrap();
        assert_eq!(names(&connection, "next"), ["A", "X"]);
    }

    #[test]
    fn move_to_done_completes_and_keeps_the_last_place() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        add(&connection, "C", "now");
        set_updated_at(&connection, b, OLD_TIME);
        let rank = fetch(&connection, b).rank;

        move_to(&connection, b, "done", 0).unwrap();

        let completed = fetch(&connection, b);
        let completed_at = completed.completed_at.clone().unwrap();
        assert_eq!(completed.horizon, "now");
        assert_eq!(completed.rank, rank);
        assert_eq!(completed.updated_at, OLD_TIME);
        assert_eq!(names(&connection, "now"), ["A", "C"]);

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
        assert_eq!(again.rank, rank);
        assert_eq!(names(&connection, "now"), ["A", "C"]);
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
    }

    #[test]
    fn delete_takes_it_off_the_board_and_restore_puts_it_back() {
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

        assert!(matches!(
            restore(&connection, b).unwrap(),
            RestoreOutcome::Restored
        ));
        let restored = fetch(&connection, b);
        assert_eq!(restored.deleted_at, None);
        assert_eq!(restored.updated_at, OLD_TIME);
        assert_eq!(names(&connection, "next"), ["A", "B", "C"]);
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

        assert!(matches!(
            restore(&connection, b).unwrap(),
            RestoreOutcome::Restored
        ));
        let restored = fetch(&connection, b);
        assert_eq!(restored.completed_at, before.completed_at);
        assert_eq!(restored.deleted_at, None);
        assert_eq!(names(&connection, "now"), ["A", "C"]);
    }

    #[test]
    fn a_move_changes_only_the_moved_initiative() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        add(&connection, "C", "now");
        add(&connection, "X", "next");
        let done = add(&connection, "Done", "next");
        move_to(&connection, done, "done", 0).unwrap();
        let deleted = add(&connection, "Deleted", "next");
        delete(&connection, deleted).unwrap();
        let before = places(&connection);

        move_to(&connection, b, "next", 0).unwrap();

        let after = places(&connection);
        let changed: Vec<i64> = before
            .iter()
            .zip(&after)
            .filter(|(old, new)| old != new)
            .map(|(old, _)| old.0)
            .collect();
        assert_eq!(changed, [b]);
        assert_eq!(names(&connection, "next"), ["B", "X"]);
    }

    #[test]
    fn complete_and_delete_keep_the_rank() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        let c = add(&connection, "C", "now");

        let rank = fetch(&connection, b).rank;
        move_to(&connection, b, DONE, 0).unwrap();
        assert_eq!(fetch(&connection, b).rank, rank);

        let rank = fetch(&connection, c).rank;
        delete(&connection, c).unwrap();
        assert_eq!(fetch(&connection, c).rank, rank);
    }

    #[test]
    fn the_database_refuses_two_initiatives_with_one_rank_on_the_board() {
        let connection = open_in_memory();
        let a = add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        let done = add(&connection, "Done", "now");
        move_to(&connection, done, DONE, 0).unwrap();
        let rank = fetch(&connection, a).rank;

        assert!(set_rank(&connection, b, &rank).is_err());
        assert_eq!(set_rank(&connection, done, &rank).unwrap(), 1);
    }

    #[test]
    fn restore_keeps_a_free_rank() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        add(&connection, "C", "now");
        let rank = fetch(&connection, b).rank;

        delete(&connection, b).unwrap();
        restore(&connection, b).unwrap();

        assert_eq!(names(&connection, "now"), ["A", "B", "C"]);
        assert_eq!(fetch(&connection, b).rank, rank);
    }

    #[test]
    fn restore_into_a_taken_rank_goes_directly_after_the_holder() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        let c = add(&connection, "C", "now");

        delete(&connection, b).unwrap();
        set_rank(&connection, c, &fetch(&connection, b).rank).unwrap();
        restore(&connection, b).unwrap();

        assert_eq!(names(&connection, "now"), ["A", "C", "B"]);
    }

    #[test]
    fn restore_into_a_taken_rank_goes_before_the_next_card() {
        let connection = open_in_memory();
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        let c = add(&connection, "C", "now");
        add(&connection, "D", "now");

        delete(&connection, b).unwrap();
        set_rank(&connection, c, &fetch(&connection, b).rank).unwrap();
        restore(&connection, b).unwrap();

        assert_eq!(names(&connection, "now"), ["A", "C", "B", "D"]);
    }

    #[test]
    fn restore_into_a_taken_rank_of_the_last_card() {
        let connection = open_in_memory();
        let a = add(&connection, "A", "now");
        let b = add(&connection, "B", "now");

        delete(&connection, b).unwrap();
        set_rank(&connection, a, &fetch(&connection, b).rank).unwrap();
        restore(&connection, b).unwrap();

        assert_eq!(names(&connection, "now"), ["A", "B"]);
    }

    #[test]
    fn reopen_goes_to_the_drop_index() {
        let connection = open_in_memory();
        add(&connection, "A", "later");
        let b = add(&connection, "B", "later");
        add(&connection, "C", "later");

        move_to(&connection, b, DONE, 0).unwrap();
        move_to(&connection, b, "later", 0).unwrap();

        assert_eq!(names(&connection, "later"), ["B", "A", "C"]);
    }

    #[test]
    fn a_move_next_to_an_invalid_rank_fails_with_a_message() {
        let connection = open_in_memory();
        let a = add(&connection, "A", "now");
        let b = add(&connection, "B", "next");
        set_rank(&connection, a, "zz").unwrap();

        let result = move_to(&connection, b, "now", 0);

        let Err(error @ Error::Rank(_)) = result else {
            panic!("the move should fail with a rank error");
        };
        assert!(error.to_string().starts_with("invalid rank"));
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
        assert_eq!(updated.rank, before.rank);
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
                "INSERT INTO initiatives (raci_role, horizon, rank, created_at, updated_at)
                 VALUES (?1, ?2, '8', 't', 't')",
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
        assert_eq!(summary.rank, stored.rank);
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

    /// Creates a meeting that covers only the initiative `id`, sets its `updated_at` to
    /// `OLD_TIME`, and returns its identifier.
    fn meeting_of(connection: &Connection, id: i64) -> i64 {
        let meeting = meetings::create(connection, "2026-09-24").unwrap();
        meetings::add_initiative(connection, meeting.id, id).unwrap();
        connection
            .execute(
                "UPDATE meetings SET updated_at = ?2 WHERE id = ?1",
                params![meeting.id, OLD_TIME],
            )
            .unwrap();
        meeting.id
    }

    fn fetch_meeting(connection: &Connection, id: i64) -> meetings::Meeting {
        meetings::get(connection, id).unwrap().unwrap()
    }

    #[test]
    fn create_needs_a_project_that_is_not_deleted() {
        let connection = open_in_memory();
        let deleted = project(&connection, "Old");
        projects::delete(&connection, deleted).unwrap();

        assert!(matches!(
            create(&connection, 999, "Launch", "", None),
            Err(Error::ProjectNotFound(999))
        ));
        assert!(matches!(
            create(&connection, deleted, "Launch", "", None),
            Err(Error::ProjectDeleted(id)) if id == deleted
        ));
        assert_eq!(count(&connection), 0);
        assert_eq!(Error::ProjectNotFound(7).to_string(), "project 7 not found");
        assert_eq!(Error::ProjectDeleted(7).to_string(), "project 7 is deleted");

        let billing = project(&connection, "Billing");
        let initiative = created_in(&connection, billing, "Launch", "", None);
        assert_eq!(initiative.project_id, billing);
        assert_eq!(fetch(&connection, initiative.id).project_id, billing);
    }

    #[test]
    fn names_are_unique_within_a_project() {
        let connection = open_in_memory();
        let billing = project(&connection, "Billing");
        let checkout = project(&connection, "Checkout");
        created_in(&connection, billing, "Launch", "", None);

        let other = created_in(&connection, checkout, "LAUNCH", "", None);
        assert_eq!(other.name, "LAUNCH");

        assert!(matches!(
            create(&connection, checkout, " launch ", "", None).unwrap(),
            CreateOutcome::NameTaken
        ));
        let second = created_in(&connection, checkout, "Second", "", None);
        assert!(matches!(
            rename(&connection, second.id, "Launch").unwrap(),
            RenameOutcome::NameTaken
        ));
        let moved_away = created_in(&connection, billing, "Other", "", None);
        assert!(matches!(
            rename(&connection, moved_away.id, "Second").unwrap(),
            RenameOutcome::Renamed { .. }
        ));

        delete(&connection, other.id).unwrap();
        created_in(&connection, checkout, "launch", "", None);
        assert!(matches!(
            restore(&connection, other.id).unwrap(),
            RestoreOutcome::NameTaken
        ));
    }

    /// Makes the meeting `meeting_id` also cover the initiative `initiative_id`, without a
    /// check of the project, and sets the `updated_at` of the meeting to `OLD_TIME`.
    fn cover(connection: &Connection, meeting_id: i64, initiative_id: i64) {
        connection
            .execute(
                "INSERT INTO meeting_initiatives (meeting_id, initiative_id, created_at)
                 VALUES (?1, ?2, 't')",
                params![meeting_id, initiative_id],
            )
            .unwrap();
        connection
            .execute(
                "UPDATE meetings SET updated_at = ?2 WHERE id = ?1",
                params![meeting_id, OLD_TIME],
            )
            .unwrap();
    }

    #[test]
    fn set_project_moves_a_meeting_that_covers_only_that_initiative() {
        let connection = open_in_memory();
        let billing = project(&connection, "Billing");
        add(&connection, "A", "now");
        let b = add(&connection, "B", "now");
        add(&connection, "C", "now");
        set_updated_at(&connection, b, OLD_TIME);
        let first = meeting_of(&connection, b);
        let second = meeting_of(&connection, b);
        let unrelated = meetings::create(&connection, "2026-09-24").unwrap();
        let before = fetch(&connection, b);
        let now_before = column(&connection, "now");

        let MoveOutcome::Moved { initiative } = set_project(&connection, b, billing).unwrap()
        else {
            panic!("the move should succeed");
        };

        assert_eq!(initiative.project_id, billing);
        assert_eq!(initiative.horizon, before.horizon);
        assert_eq!(initiative.rank, before.rank);
        assert_ne!(initiative.updated_at, OLD_TIME);
        assert_eq!(fetch(&connection, b), initiative);
        assert_eq!(column(&connection, "now"), now_before);
        for id in [first, second] {
            let meeting = fetch_meeting(&connection, id);
            assert_eq!(meeting.project_id, Some(billing));
            assert_eq!(meeting.initiative_ids, vec![b]);
            assert_ne!(meeting.updated_at, OLD_TIME);
        }
        assert_eq!(fetch_meeting(&connection, unrelated.id), unrelated);
    }

    #[test]
    fn set_project_keeps_a_meeting_that_covers_another_initiative() {
        let connection = open_in_memory();
        let billing = project(&connection, "Billing");
        let moved = add(&connection, "Moved", "now");
        let other = add(&connection, "Other", "now");
        let meeting = meeting_of(&connection, moved);
        cover(&connection, meeting, other);

        let MoveOutcome::Moved { .. } = set_project(&connection, moved, billing).unwrap() else {
            panic!("the move should succeed");
        };

        let meeting = fetch_meeting(&connection, meeting);
        assert_eq!(meeting.project_id, Some(home(&connection)));
        assert_eq!(meeting.initiative_ids, vec![other]);
        assert_ne!(meeting.updated_at, OLD_TIME);
    }

    #[test]
    fn set_project_keeps_a_meeting_whose_other_initiative_is_deleted() {
        let connection = open_in_memory();
        let billing = project(&connection, "Billing");
        let moved = add(&connection, "Moved", "now");
        let other = add(&connection, "Other", "now");
        let meeting = meeting_of(&connection, moved);
        cover(&connection, meeting, other);
        delete(&connection, other).unwrap();

        let MoveOutcome::Moved { .. } = set_project(&connection, moved, billing).unwrap() else {
            panic!("the move should succeed");
        };

        let meeting = fetch_meeting(&connection, meeting);
        assert_eq!(meeting.project_id, Some(home(&connection)));
        assert_eq!(meeting.initiative_ids, vec![other]);
        assert_ne!(meeting.updated_at, OLD_TIME);
    }

    #[test]
    fn set_project_returns_name_taken_and_changes_nothing() {
        let connection = open_in_memory();
        let billing = project(&connection, "Billing");
        created_in(&connection, billing, "Launch", "", None);
        let launch = add(&connection, "LAUNCH", "now");
        set_updated_at(&connection, launch, OLD_TIME);
        let meeting = meeting_of(&connection, launch);
        let before = fetch(&connection, launch);
        let meeting_before = fetch_meeting(&connection, meeting);

        assert!(matches!(
            set_project(&connection, launch, billing).unwrap(),
            MoveOutcome::NameTaken
        ));

        assert_eq!(fetch(&connection, launch), before);
        assert_eq!(fetch_meeting(&connection, meeting), meeting_before);
    }

    #[test]
    fn set_project_accepts_the_name_of_a_deleted_initiative() {
        let connection = open_in_memory();
        let billing = project(&connection, "Billing");
        let old = created_in(&connection, billing, "Launch", "", None);
        delete(&connection, old.id).unwrap();
        let launch = add(&connection, "Launch", "now");

        let MoveOutcome::Moved { initiative } = set_project(&connection, launch, billing).unwrap()
        else {
            panic!("the move should succeed");
        };
        assert_eq!(initiative.project_id, billing);
    }

    #[test]
    fn set_project_refuses_a_deleted_project() {
        let connection = open_in_memory();
        let deleted = project(&connection, "Old");
        projects::delete(&connection, deleted).unwrap();
        let launch = add(&connection, "Launch", "now");
        let meeting = meeting_of(&connection, launch);
        let before = fetch(&connection, launch);
        let meeting_before = fetch_meeting(&connection, meeting);

        assert!(matches!(
            set_project(&connection, launch, deleted),
            Err(Error::ProjectDeleted(id)) if id == deleted
        ));
        assert!(matches!(
            set_project(&connection, launch, 999),
            Err(Error::ProjectNotFound(999))
        ));
        assert!(matches!(
            set_project(&connection, 999, home(&connection)),
            Err(Error::NotFound(999))
        ));

        assert_eq!(fetch(&connection, launch), before);
        assert_eq!(fetch_meeting(&connection, meeting), meeting_before);
    }

    #[test]
    fn set_project_refuses_a_deleted_project_that_the_initiative_already_has() {
        let connection = open_in_memory();
        let launch = add(&connection, "Launch", "now");
        // The backend refuses to delete a project with initiatives, so the project is marked
        // as deleted directly.
        connection
            .execute(
                "UPDATE projects SET deleted_at = 't' WHERE id = ?1",
                params![home(&connection)],
            )
            .unwrap();

        assert!(matches!(
            set_project(&connection, launch, home(&connection)),
            Err(Error::ProjectDeleted(id)) if id == home(&connection)
        ));
    }

    #[test]
    fn set_project_refuses_a_deleted_initiative() {
        let connection = open_in_memory();
        let billing = project(&connection, "Billing");
        let launch = add(&connection, "Launch", "now");
        delete(&connection, launch).unwrap();
        let before = fetch(&connection, launch);

        assert!(matches!(
            set_project(&connection, launch, billing),
            Err(Error::Deleted(id)) if id == launch
        ));
        assert_eq!(fetch(&connection, launch), before);
    }

    #[test]
    fn restore_returns_project_deleted() {
        let connection = open_in_memory();
        let billing = project(&connection, "Billing");
        let launch = created_in(&connection, billing, "Launch", "", None);
        delete(&connection, launch.id).unwrap();
        projects::delete(&connection, billing).unwrap();
        let before = fetch(&connection, launch.id);

        assert!(matches!(
            restore(&connection, launch.id).unwrap(),
            RestoreOutcome::ProjectDeleted
        ));

        assert_eq!(fetch(&connection, launch.id), before);
    }

    #[test]
    fn the_database_refuses_a_second_active_initiative_with_the_same_name_in_one_project() {
        let connection = open_in_memory();
        let billing = project(&connection, "Billing");
        let checkout = project(&connection, "Checkout");
        created_in(&connection, billing, "Launch", "", None);
        let other = created_in(&connection, checkout, "Launch", "", None);

        let result = connection.execute(
            "UPDATE initiatives SET project_id = ?2 WHERE id = ?1",
            params![other.id, billing],
        );
        assert!(result.is_err());

        let result = connection.execute(
            "UPDATE initiatives SET project_id = 999 WHERE id = ?1",
            params![other.id],
        );
        assert!(result.is_err());
    }
}
