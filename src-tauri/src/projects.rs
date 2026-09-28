//! Storage of projects in the application database.
//!
//! A project is a long lived effort of the company, such as a product area. Its name is unique
//! among the projects that are not deleted, without regard to uppercase and lowercase letters.
//! An empty name never conflicts. A deleted project stays in the database, so that the delete
//! can be undone.

use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::meetings::NOW;

/// One project, with its name and its description.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// The identifier that the database gives the project.
    pub id: i64,
    /// The name of the project, without spaces at the start or the end. It can be empty.
    pub name: String,
    /// The description, as Markdown.
    pub description: String,
    /// The time when the project was created, as an RFC 3339 timestamp in UTC.
    pub created_at: String,
    /// The time when the name or the description was last changed, as an RFC 3339 timestamp
    /// in UTC.
    pub updated_at: String,
    /// The time when the project was deleted, as an RFC 3339 timestamp in UTC, or `None` if it
    /// is not deleted.
    pub deleted_at: Option<String>,
}

/// The result of a create.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum CreateOutcome {
    /// The project was saved.
    Created {
        /// The project as it is stored after the create.
        project: Project,
    },
    /// Another project that is not deleted has the same name. Nothing was saved.
    NameTaken,
}

/// The result of a rename.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum RenameOutcome {
    /// The name was saved.
    Renamed {
        /// The project as it is stored after the change.
        project: Project,
    },
    /// Another project that is not deleted has the same name. Nothing was changed.
    NameTaken,
}

/// The result of a delete.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum DeleteOutcome {
    /// The project is deleted now.
    Deleted,
    /// The project has initiatives that are not deleted, also completed ones. Nothing was
    /// changed.
    HasInitiatives,
}

/// The result of a restore of a deleted project.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum RestoreOutcome {
    /// The project is not deleted now.
    Restored,
    /// Another project that is not deleted has the same name. Nothing was changed, and the
    /// project stays deleted.
    NameTaken,
}

/// A problem that stops a project operation.
#[derive(Debug)]
pub enum Error {
    /// No project has the given identifier.
    NotFound(i64),
    /// The name and the description are empty, so the user did not change the new project.
    /// Such a project is never saved.
    Unchanged,
    /// The database reported an error.
    Database(rusqlite::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NotFound(id) => write!(f, "project {id} not found"),
            Error::Unchanged => write!(f, "a project needs a name or a description"),
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

/// The columns of a project, in the order that `project_from_row` reads them.
const COLUMNS: &str = "id, name, description, created_at, updated_at, deleted_at";

/// Returns the projects. When `include_deleted` is false, leaves out the deleted projects.
/// The order is by identifier, but callers must not depend on it.
pub fn list(connection: &Connection, include_deleted: bool) -> Result<Vec<Project>, Error> {
    let projects = connection
        .prepare(&format!(
            "SELECT {COLUMNS} FROM projects WHERE ?1 OR deleted_at IS NULL ORDER BY id"
        ))?
        .query_map(params![include_deleted], project_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(projects)
}

/// Creates a project with the given name and description.
///
/// Removes the spaces at the start and the end of `name`. If the name and the description are
/// empty, returns `Error::Unchanged`. If another project that is not deleted has the same name,
/// without regard to uppercase and lowercase letters, returns `CreateOutcome::NameTaken` and
/// saves nothing. An empty name never conflicts.
pub fn create(
    connection: &Connection,
    name: &str,
    description: &str,
) -> Result<CreateOutcome, Error> {
    let name = name.trim();
    if name.is_empty() && description.is_empty() {
        return Err(Error::Unchanged);
    }
    let transaction = connection.unchecked_transaction()?;
    if name_is_taken(&transaction, None, name)? {
        return Ok(CreateOutcome::NameTaken);
    }
    let id = transaction.query_row(
        &format!(
            "INSERT INTO projects (name, description, created_at, updated_at)
             VALUES (?1, ?2, {NOW}, {NOW}) RETURNING id"
        ),
        params![name, description],
        |row| row.get(0),
    )?;
    transaction.commit()?;
    let project = get(connection, id)?.ok_or(Error::NotFound(id))?;
    Ok(CreateOutcome::Created { project })
}

/// Returns the project with the given identifier, also a deleted one, or `None` if no project
/// has it.
pub fn get(connection: &Connection, id: i64) -> Result<Option<Project>, Error> {
    let project = connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM projects WHERE id = ?1"),
            params![id],
            project_from_row,
        )
        .optional()?;
    Ok(project)
}

/// Removes the spaces at the start and the end of `name`, and saves it as the name of the
/// project. Sets the time it was last changed. If another project that is not deleted has the
/// same name, without regard to uppercase and lowercase letters, returns
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
        &format!("UPDATE projects SET name = ?2, updated_at = {NOW} WHERE id = ?1"),
        params![id, name],
    )?;
    let project = get(connection, id)?.ok_or(Error::NotFound(id))?;
    Ok(RenameOutcome::Renamed { project })
}

/// Replaces the description of a project, and sets the time it was last changed. Does not
/// change the name. Returns the project as it is stored after the change.
pub fn update(connection: &Connection, id: i64, description: &str) -> Result<Project, Error> {
    let changed = connection.execute(
        &format!("UPDATE projects SET description = ?2, updated_at = {NOW} WHERE id = ?1"),
        params![id, description],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Marks a project as deleted. The row stays in the database. Records the current time as the
/// time the project was deleted. Deleting a project that is already deleted keeps the time that
/// was recorded first. Does not change `updated_at` or the meetings of the project.
///
/// If the project has an initiative that is not deleted, also a completed one, returns
/// `DeleteOutcome::HasInitiatives` and changes nothing.
pub fn delete(connection: &Connection, id: i64) -> Result<DeleteOutcome, Error> {
    let transaction = connection.unchecked_transaction()?;
    let has_initiatives: bool = transaction.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM initiatives WHERE project_id = ?1 AND deleted_at IS NULL
         )",
        params![id],
        |row| row.get(0),
    )?;
    if has_initiatives {
        return Ok(DeleteOutcome::HasInitiatives);
    }
    let changed = transaction.execute(
        &format!("UPDATE projects SET deleted_at = coalesce(deleted_at, {NOW}) WHERE id = ?1"),
        params![id],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    transaction.commit()?;
    Ok(DeleteOutcome::Deleted)
}

/// Brings a deleted project back. Does not change `updated_at`.
///
/// If another project that is not deleted has the same name, returns
/// `RestoreOutcome::NameTaken` and changes nothing. Restoring a project that is not deleted
/// changes nothing.
pub fn restore(connection: &Connection, id: i64) -> Result<RestoreOutcome, Error> {
    let project = get(connection, id)?.ok_or(Error::NotFound(id))?;
    if project.deleted_at.is_none() {
        return Ok(RestoreOutcome::Restored);
    }
    if name_is_taken(connection, Some(id), &project.name)? {
        return Ok(RestoreOutcome::NameTaken);
    }
    connection.execute(
        "UPDATE projects SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )?;
    Ok(RestoreOutcome::Restored)
}

/// Returns true if a project with the identifier `id` exists and is not deleted.
pub(crate) fn project_is_active(connection: &Connection, id: i64) -> rusqlite::Result<bool> {
    connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1 AND deleted_at IS NULL)",
        params![id],
        |row| row.get(0),
    )
}

/// Returns true if a project with the identifier `id` exists, also a deleted one.
pub(crate) fn project_exists(connection: &Connection, id: i64) -> rusqlite::Result<bool> {
    connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1)",
        params![id],
        |row| row.get(0),
    )
}

/// Returns true if a project that is not deleted has `name`, without regard to uppercase and
/// lowercase letters. The project `except` does not count. An empty name is never taken.
fn name_is_taken(connection: &Connection, except: Option<i64>, name: &str) -> Result<bool, Error> {
    if name.is_empty() {
        return Ok(false);
    }
    let taken = connection.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM projects
             WHERE id IS NOT ?1 AND deleted_at IS NULL AND name = ?2 COLLATE NOCASE
         )",
        params![except, name],
        |row| row.get(0),
    )?;
    Ok(taken)
}

fn project_from_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        deleted_at: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::params;

    use super::*;
    use crate::db::open_in_memory;

    const OLD_TIME: &str = "2000-01-01T00:00:00.000Z";

    /// Creates a project with the given values and returns it. Fails the test if the project
    /// is not created.
    fn created(connection: &Connection, name: &str, description: &str) -> Project {
        match create(connection, name, description).unwrap() {
            CreateOutcome::Created { project } => project,
            CreateOutcome::NameTaken => panic!("the create should succeed"),
        }
    }

    fn fetch(connection: &Connection, id: i64) -> Project {
        get(connection, id).unwrap().unwrap()
    }

    fn count(connection: &Connection) -> i64 {
        connection
            .query_row("SELECT count(*) FROM projects", [], |row| row.get(0))
            .unwrap()
    }

    fn set_column(connection: &Connection, id: i64, column: &str, time: &str) {
        connection
            .execute(
                &format!("UPDATE projects SET {column} = ?2 WHERE id = ?1"),
                params![id, time],
            )
            .unwrap();
    }

    #[test]
    fn create_trims_and_saves() {
        let connection = open_in_memory();

        let project = created(&connection, "  Checkout ", "## Goals\n");

        assert_eq!(project.name, "Checkout");
        assert_eq!(project.description, "## Goals\n");
        assert_eq!(project.deleted_at, None);
        assert_eq!(project.created_at, project.updated_at);
        assert!(project.created_at.ends_with('Z'));
        assert_eq!(fetch(&connection, project.id), project);

        let only_description = created(&connection, "   ", "Notes");
        assert_eq!(only_description.name, "");
    }

    #[test]
    fn create_refuses_an_empty_name_and_description() {
        let connection = open_in_memory();

        for name in ["", "   "] {
            assert!(
                matches!(create(&connection, name, ""), Err(Error::Unchanged)),
                "{name:?} should be refused"
            );
        }

        assert_eq!(count(&connection), 0);
        assert_eq!(
            Error::Unchanged.to_string(),
            "a project needs a name or a description"
        );
    }

    #[test]
    fn create_and_rename_return_name_taken_without_regard_to_case() {
        let connection = open_in_memory();
        created(&connection, "Checkout", "");
        let other = created(&connection, "Billing", "");
        set_column(&connection, other.id, "updated_at", OLD_TIME);
        let before = fetch(&connection, other.id);

        assert!(matches!(
            create(&connection, " CHECKOUT ", "Notes").unwrap(),
            CreateOutcome::NameTaken
        ));
        assert_eq!(count(&connection), 2);

        assert!(matches!(
            rename(&connection, other.id, "checkout").unwrap(),
            RenameOutcome::NameTaken
        ));
        assert_eq!(fetch(&connection, other.id), before);

        let RenameOutcome::Renamed { project } =
            rename(&connection, other.id, "  BILLING ").unwrap()
        else {
            panic!("a rename to its own name in another case should succeed");
        };
        assert_eq!(project.name, "BILLING");
        assert_ne!(project.updated_at, OLD_TIME);
        assert_eq!(fetch(&connection, other.id), project);
    }

    #[test]
    fn empty_names_do_not_conflict() {
        let connection = open_in_memory();
        created(&connection, "", "First");
        created(&connection, "", "Second");
        let third = created(&connection, "Third", "");

        let RenameOutcome::Renamed { project } = rename(&connection, third.id, "  ").unwrap()
        else {
            panic!("the rename should succeed");
        };
        assert_eq!(project.name, "");
        assert_eq!(count(&connection), 3);
    }

    #[test]
    fn a_deleted_project_gives_its_name_free() {
        let connection = open_in_memory();
        let old = created(&connection, "Checkout", "");
        assert!(matches!(
            delete(&connection, old.id).unwrap(),
            DeleteOutcome::Deleted
        ));

        assert_eq!(created(&connection, "checkout", "").name, "checkout");
        let other = created(&connection, "Other", "");
        assert!(matches!(
            rename(&connection, other.id, "CHECKOUT").unwrap(),
            RenameOutcome::NameTaken
        ));
    }

    #[test]
    fn restore_returns_name_taken_when_the_name_is_used() {
        let connection = open_in_memory();
        let old = created(&connection, "Checkout", "");
        delete(&connection, old.id).unwrap();
        created(&connection, "CHECKOUT", "");
        let before = fetch(&connection, old.id);

        assert!(matches!(
            restore(&connection, old.id).unwrap(),
            RestoreOutcome::NameTaken
        ));
        assert_eq!(fetch(&connection, old.id), before);

        let free = created(&connection, "Billing", "");
        delete(&connection, free.id).unwrap();
        set_column(&connection, free.id, "updated_at", OLD_TIME);
        assert!(matches!(
            restore(&connection, free.id).unwrap(),
            RestoreOutcome::Restored
        ));
        let restored = fetch(&connection, free.id);
        assert_eq!(restored.deleted_at, None);
        assert_eq!(restored.updated_at, OLD_TIME);
    }

    #[test]
    fn list_leaves_out_deleted_projects_unless_asked() {
        let connection = open_in_memory();
        let kept = created(&connection, "Kept", "Text");
        let deleted = created(&connection, "Deleted", "");
        delete(&connection, deleted.id).unwrap();

        assert_eq!(list(&connection, false).unwrap(), vec![kept.clone()]);

        let mut all: Vec<i64> = list(&connection, true)
            .unwrap()
            .iter()
            .map(|project| project.id)
            .collect();
        all.sort_unstable();
        assert_eq!(all, vec![kept.id, deleted.id]);
    }

    #[test]
    fn update_saves_the_description_and_changes_updated_at() {
        let connection = open_in_memory();
        let project = created(&connection, "Checkout", "");
        set_column(&connection, project.id, "updated_at", OLD_TIME);

        let updated = update(&connection, project.id, "## Goals\n").unwrap();

        assert_eq!(updated.description, "## Goals\n");
        assert_eq!(updated.name, "Checkout");
        assert_eq!(updated.created_at, project.created_at);
        assert_ne!(updated.updated_at, OLD_TIME);
        assert_eq!(fetch(&connection, project.id), updated);
    }

    #[test]
    fn delete_keeps_the_first_time() {
        let connection = open_in_memory();
        let project = created(&connection, "Checkout", "");
        set_column(&connection, project.id, "updated_at", OLD_TIME);

        delete(&connection, project.id).unwrap();
        let deleted = fetch(&connection, project.id);
        assert!(deleted.deleted_at.is_some());
        assert_eq!(deleted.updated_at, OLD_TIME);

        set_column(&connection, project.id, "deleted_at", OLD_TIME);
        assert!(matches!(
            delete(&connection, project.id).unwrap(),
            DeleteOutcome::Deleted
        ));
        assert_eq!(
            fetch(&connection, project.id).deleted_at.as_deref(),
            Some(OLD_TIME)
        );
    }

    #[test]
    fn project_is_active_is_false_for_a_deleted_or_missing_project() {
        let connection = open_in_memory();
        let project = created(&connection, "Checkout", "");

        assert!(project_is_active(&connection, project.id).unwrap());
        delete(&connection, project.id).unwrap();
        assert!(!project_is_active(&connection, project.id).unwrap());
        assert!(!project_is_active(&connection, 999).unwrap());
    }

    #[test]
    fn the_database_refuses_two_active_projects_with_one_name() {
        let connection = open_in_memory();
        let insert = |name: &str| {
            connection.execute(
                "INSERT INTO projects (name, created_at, updated_at) VALUES (?1, 't', 't')",
                params![name],
            )
        };

        insert("Checkout").unwrap();
        assert!(insert("checkout").is_err());
        insert("").unwrap();
        insert("").unwrap();
    }

    #[test]
    fn operations_on_a_missing_project_return_not_found() {
        let connection = open_in_memory();
        assert_eq!(get(&connection, 999).unwrap(), None);
        assert!(matches!(
            rename(&connection, 999, "x"),
            Err(Error::NotFound(999))
        ));
        assert!(matches!(
            update(&connection, 999, ""),
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
        assert_eq!(Error::NotFound(7).to_string(), "project 7 not found");
    }

    #[test]
    fn delete_returns_has_initiatives_for_a_project_with_initiatives_that_are_not_deleted() {
        let connection = open_in_memory();
        let project = created(&connection, "Checkout", "");
        let create =
            |name: &str| match crate::initiatives::create(&connection, project.id, name, "", None)
                .unwrap()
            {
                crate::initiatives::CreateOutcome::Created { initiative } => initiative.id,
                crate::initiatives::CreateOutcome::NameTaken => panic!("the create should succeed"),
            };
        let completed = create("Completed");
        crate::initiatives::move_to(&connection, completed, "done", 0).unwrap();
        let deleted = create("Deleted");
        crate::initiatives::delete(&connection, deleted).unwrap();

        assert!(matches!(
            delete(&connection, project.id).unwrap(),
            DeleteOutcome::HasInitiatives
        ));
        assert_eq!(fetch(&connection, project.id), project);

        crate::initiatives::delete(&connection, completed).unwrap();
        assert!(matches!(
            delete(&connection, project.id).unwrap(),
            DeleteOutcome::Deleted
        ));
        assert!(fetch(&connection, project.id).deleted_at.is_some());
    }
}
