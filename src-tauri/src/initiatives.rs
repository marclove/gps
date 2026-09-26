//! Storage of initiatives, and the role of the user in each one, in the application database.

use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::meetings::NOW;

/// The name that a new initiative gets before the user changes it.
pub const DEFAULT_NAME: &str = "Untitled initiative";

/// The roles of the RACI model that the user can have in an initiative, as they are stored.
pub const RACI_ROLES: [&str; 4] = ["responsible", "accountable", "consulted", "informed"];

/// One initiative, with its description and the role of the user in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Initiative {
    /// The identifier that the database gives the initiative.
    pub id: i64,
    /// The name of the initiative.
    pub name: String,
    /// The description, as Markdown.
    pub description: String,
    /// The role of the user in the initiative, one of `RACI_ROLES`, or `None` if the user did
    /// not choose a role.
    pub raci_role: Option<String>,
    /// The time when the initiative was created, as an RFC 3339 timestamp in UTC.
    pub created_at: String,
    /// The time when the name, the description, or the role was last changed, as an RFC 3339
    /// timestamp in UTC.
    pub updated_at: String,
    /// The time when the initiative was archived, as an RFC 3339 timestamp in UTC, or `None`
    /// if it is not archived.
    pub archived_at: Option<String>,
}

/// The part of an initiative that a list of initiatives shows. It does not include the
/// description.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitiativeSummary {
    /// The identifier that the database gives the initiative.
    pub id: i64,
    /// The name of the initiative.
    pub name: String,
    /// The role of the user in the initiative, one of `RACI_ROLES`, or `None` if the user did
    /// not choose a role.
    pub raci_role: Option<String>,
    /// The time when the initiative was last changed, as an RFC 3339 timestamp in UTC.
    pub updated_at: String,
    /// The time when the initiative was archived, as an RFC 3339 timestamp in UTC, or `None`
    /// if it is not archived.
    pub archived_at: Option<String>,
}

/// A problem that stops an initiative operation.
#[derive(Debug)]
pub enum Error {
    /// No initiative has the given identifier.
    NotFound(i64),
    /// The role is not one of `RACI_ROLES`.
    InvalidRole(String),
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

/// Returns summaries of the initiatives. When `include_archived` is false, leaves out the
/// archived initiatives. The initiative that was created last is first.
pub fn list(
    connection: &Connection,
    include_archived: bool,
) -> Result<Vec<InitiativeSummary>, Error> {
    let mut statement = connection.prepare(
        "SELECT id, name, raci_role, updated_at, archived_at FROM initiatives
         WHERE ?1 OR archived_at IS NULL
         ORDER BY created_at DESC, id DESC",
    )?;
    let summaries = statement
        .query_map(params![include_archived], |row| {
            Ok(InitiativeSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                raci_role: row.get(2)?,
                updated_at: row.get(3)?,
                archived_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(summaries)
}

/// Creates an initiative with the default name, an empty description, and no role.
pub fn create(connection: &Connection) -> Result<Initiative, Error> {
    let id = connection.query_row(
        &format!(
            "INSERT INTO initiatives (name, description, created_at, updated_at)
             VALUES (?1, '', {NOW}, {NOW}) RETURNING id"
        ),
        params![DEFAULT_NAME],
        |row| row.get(0),
    )?;
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Returns the initiative with the given identifier, or `None` if no initiative has it.
pub fn get(connection: &Connection, id: i64) -> Result<Option<Initiative>, Error> {
    let initiative = connection
        .query_row(
            "SELECT id, name, description, raci_role, created_at, updated_at, archived_at
             FROM initiatives WHERE id = ?1",
            params![id],
            initiative_from_row,
        )
        .optional()?;
    Ok(initiative)
}

/// Replaces the name, the description, and the role of an initiative, and sets the time it
/// was last changed. The role must be one of `RACI_ROLES`, or `None` for no role. Returns the
/// initiative as it is stored after the change.
pub fn update(
    connection: &Connection,
    id: i64,
    name: &str,
    description: &str,
    raci_role: Option<&str>,
) -> Result<Initiative, Error> {
    if let Some(role) = raci_role {
        if !RACI_ROLES.contains(&role) {
            return Err(Error::InvalidRole(role.to_owned()));
        }
    }
    let changed = connection.execute(
        &format!(
            "UPDATE initiatives SET name = ?2, description = ?3, raci_role = ?4, updated_at = {NOW}
             WHERE id = ?1"
        ),
        params![id, name, description, raci_role],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Hides an initiative from the list of initiatives without deleting it. Records the current
/// time as the time the initiative was archived. Archiving an initiative that is already
/// archived keeps the time that was recorded first. Does not change `updated_at` or the
/// meetings that are assigned to the initiative.
pub fn archive(connection: &Connection, id: i64) -> Result<(), Error> {
    let changed = connection.execute(
        &format!("UPDATE initiatives SET archived_at = coalesce(archived_at, {NOW}) WHERE id = ?1"),
        params![id],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    Ok(())
}

/// Makes an archived initiative appear in the list of initiatives again.
pub fn unarchive(connection: &Connection, id: i64) -> Result<(), Error> {
    let changed = connection.execute(
        "UPDATE initiatives SET archived_at = NULL WHERE id = ?1",
        params![id],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    Ok(())
}

fn initiative_from_row(row: &Row<'_>) -> rusqlite::Result<Initiative> {
    Ok(Initiative {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        raci_role: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        archived_at: row.get(6)?,
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
                "UPDATE initiatives SET updated_at = ?2 WHERE id = ?1",
                params![id, time],
            )
            .unwrap();
    }

    fn ids(summaries: &[InitiativeSummary]) -> Vec<i64> {
        summaries.iter().map(|summary| summary.id).collect()
    }

    #[test]
    fn create_gives_the_default_name_an_empty_description_and_no_role() {
        let connection = open_in_memory();

        let initiative = create(&connection).unwrap();

        assert_eq!(initiative.name, "Untitled initiative");
        assert_eq!(initiative.description, "");
        assert_eq!(initiative.raci_role, None);
        assert_eq!(initiative.archived_at, None);
        assert_eq!(initiative.created_at, initiative.updated_at);
        assert!(initiative.created_at.ends_with('Z'));
        assert_eq!(get(&connection, initiative.id).unwrap(), Some(initiative));
    }

    #[test]
    fn list_leaves_out_archived_initiatives_unless_asked() {
        let connection = open_in_memory();
        let kept = create(&connection).unwrap();
        let archived = create(&connection).unwrap();

        archive(&connection, archived.id).unwrap();

        assert_eq!(ids(&list(&connection, false).unwrap()), vec![kept.id]);
        let all = list(&connection, true).unwrap();
        assert_eq!(ids(&all), vec![archived.id, kept.id]);
        assert!(all[0].archived_at.is_some());
        assert_eq!(all[1].archived_at, None);
    }

    #[test]
    fn list_puts_the_newest_first() {
        let connection = open_in_memory();
        let first = create(&connection).unwrap();
        let second = create(&connection).unwrap();
        let third = create(&connection).unwrap();
        connection
            .execute("UPDATE initiatives SET created_at = ?1", params![OLD_TIME])
            .unwrap();

        assert_eq!(
            ids(&list(&connection, false).unwrap()),
            vec![third.id, second.id, first.id]
        );
    }

    #[test]
    fn update_replaces_the_fields_and_changes_updated_at() {
        let connection = open_in_memory();
        let created = create(&connection).unwrap();
        set_updated_at(&connection, created.id, OLD_TIME);

        let updated = update(
            &connection,
            created.id,
            "Launch",
            "## Goals\n\n- Ship it\n",
            Some("accountable"),
        )
        .unwrap();

        assert_eq!(updated.name, "Launch");
        assert_eq!(updated.description, "## Goals\n\n- Ship it\n");
        assert_eq!(updated.raci_role.as_deref(), Some("accountable"));
        assert_eq!(updated.created_at, created.created_at);
        assert_ne!(updated.updated_at, OLD_TIME);
        assert_eq!(get(&connection, created.id).unwrap(), Some(updated));
    }

    #[test]
    fn update_accepts_no_role() {
        let connection = open_in_memory();
        let created = create(&connection).unwrap();
        update(&connection, created.id, "Launch", "", Some("informed")).unwrap();

        let updated = update(&connection, created.id, "Launch", "", None).unwrap();

        assert_eq!(updated.raci_role, None);
    }

    #[test]
    fn update_refuses_an_unknown_role_and_keeps_the_initiative() {
        let connection = open_in_memory();
        let created = create(&connection).unwrap();

        for role in ["Responsible", "owner"] {
            assert!(
                matches!(
                    update(&connection, created.id, "Launch", "x", Some(role)),
                    Err(Error::InvalidRole(ref refused)) if refused == role
                ),
                "{role} should be refused"
            );
        }
        assert_eq!(get(&connection, created.id).unwrap(), Some(created));
    }

    #[test]
    fn the_database_refuses_an_unknown_role() {
        let connection = open_in_memory();
        let result = connection.execute(
            "INSERT INTO initiatives (name, raci_role, created_at, updated_at)
             VALUES ('x', 'owner', 't', 't')",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn archive_keeps_the_first_time_and_does_not_change_updated_at() {
        let connection = open_in_memory();
        let created = create(&connection).unwrap();
        set_updated_at(&connection, created.id, OLD_TIME);

        archive(&connection, created.id).unwrap();
        let archived = get(&connection, created.id).unwrap().unwrap();
        assert!(archived.archived_at.is_some());
        assert_eq!(archived.updated_at, OLD_TIME);

        connection
            .execute(
                "UPDATE initiatives SET archived_at = ?2 WHERE id = ?1",
                params![created.id, OLD_TIME],
            )
            .unwrap();
        archive(&connection, created.id).unwrap();
        let archived_again = get(&connection, created.id).unwrap().unwrap();
        assert_eq!(archived_again.archived_at.as_deref(), Some(OLD_TIME));
        assert_eq!(archived_again.updated_at, OLD_TIME);
    }

    #[test]
    fn unarchive_brings_it_back_into_the_list() {
        let connection = open_in_memory();
        let first = create(&connection).unwrap();
        let second = create(&connection).unwrap();
        archive(&connection, second.id).unwrap();

        unarchive(&connection, second.id).unwrap();

        let summaries = list(&connection, false).unwrap();
        assert_eq!(ids(&summaries), vec![second.id, first.id]);
        assert_eq!(summaries[0].archived_at, None);
    }

    #[test]
    fn archiving_an_initiative_keeps_the_assignments_of_its_meetings() {
        let connection = open_in_memory();
        let initiative = create(&connection).unwrap();
        let meeting = meetings::create(&connection, "2026-09-24").unwrap();
        meetings::set_initiative(&connection, meeting.id, Some(initiative.id)).unwrap();

        archive(&connection, initiative.id).unwrap();

        let stored = meetings::get(&connection, meeting.id).unwrap().unwrap();
        assert_eq!(stored.initiative_id, Some(initiative.id));
    }

    #[test]
    fn operations_on_a_missing_initiative_return_not_found() {
        let connection = open_in_memory();
        assert_eq!(get(&connection, 999).unwrap(), None);
        assert!(matches!(
            update(&connection, 999, "x", "", None),
            Err(Error::NotFound(999))
        ));
        assert!(matches!(
            archive(&connection, 999),
            Err(Error::NotFound(999))
        ));
        assert!(matches!(
            unarchive(&connection, 999),
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
    }
}
