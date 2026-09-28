# 19. Store projects and place each initiative in one

Date: 2026-09-28

## Status

Accepted

## Context

Feature ticket 0008 adds projects. A project is a long lived effort of the company, such as a product area or a platform, that the user works on. The user wants to record their projects, put each initiative in its project, and say which project a meeting was about. The ticket gives a draft of the data model, and `docs/target-data-model.md` describes the same tables.

Today the database has three tables (see `docs/data-model.md`):

- `meetings`, where each row has an optional `initiative_id` that refers to the initiative that the meeting is assigned to,
- `initiatives`, where the name is unique among all initiatives that are not deleted (ADR 0013, ADR 0017),
- `tasks`, which does not change in this ticket.

The Rust backend owns the SQLite database (ADR 0003). Deleted rows stay in the database with a `deleted_at` time, so that "Undo" can bring them back (ADR 0017). Migrations run while foreign keys are off, and each migration that changes a table ends with a foreign key check (ADR 0017).

The ticket asks for these rules:

- Every initiative belongs to one project. Its name is unique within its project.
- A meeting is about one project or about no project. Its initiative, if it has one, belongs to its project.
- Two projects that are not deleted cannot have the same name.
- Deleting a project that still has initiatives is refused.

We had to decide:

- how the tables change, and how the migration gives a project to the initiatives that exist today,
- whether an initiative can move to another project,
- which rules the database enforces and which the backend enforces,
- what happens to the meetings of a project, and to its deleted initiatives, when the project is deleted,
- which commands the frontend uses.

## Decision

### Tables

A new table `projects` has the columns of the ticket's draft:

| Column        | Meaning                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| `id`          | The identifier that SQLite gives the row.                                             |
| `name`        | Not null, default empty. Stored without spaces at the start and the end.              |
| `description` | Not null, default empty. Markdown, like the notes of a meeting (ADR 0004).            |
| `created_at`  | Not null. The time of the create, as an RFC 3339 timestamp in UTC.                    |
| `updated_at`  | Not null. The time of the last change to the name or the description.                 |
| `deleted_at`  | Null until the user deletes the project. Then the time of the delete.                 |

The unique index `projects_name` is on `name COLLATE NOCASE`, limited to rows where `deleted_at` is null and `name` is not empty. This is the same rule as the one for initiative names (ADR 0013): "Checkout" and "checkout" are the same name, a deleted project gives its name free, and any number of projects can have an empty name. The user interface shows "Untitled project" for an empty name. An empty name is allowed because a new project is a draft until the user changes it (ADR 0020), and a draft can have a description but no name.

The table `initiatives` gets `project_id INTEGER NOT NULL REFERENCES projects(id)`. SQLite cannot add a column that is not null and refers to another table, so the migration rebuilds the table, in the same way as ADR 0017 did. The rebuild keeps the identifiers of the rows, so the references from `meetings` stay valid. After the rebuild:

- The unique index `initiatives_name` is on `(project_id, name COLLATE NOCASE)`, with the same limits as before. Two projects can each have an initiative named "Launch".
- A new index `initiatives_project_id` on `project_id` makes it fast to find the initiatives of a project, including deleted ones and ones with an empty name, which the unique index leaves out.
- The index `initiatives_horizon_rank` is created again without change.

The table `meetings` gets `project_id INTEGER REFERENCES projects(id)`, which may be null, and an index `meetings_project_id`. A null value means that the meeting is about no project, such as a 1:1.

### The migration

Every initiative must have a project, but the initiatives that exist today have none, and the migration cannot know which project each one belongs to. So:

- If the table `initiatives` has at least one row, the migration creates one project named "Unsorted", with an empty description, and puts every initiative in it, also the completed and the deleted ones.
- If the table has no rows, the migration creates no project.
- Each meeting that is assigned to an initiative gets the project of that initiative. Other meetings get no project.

After the update, the user moves each initiative from "Unsorted" to its real project, and can then delete "Unsorted" or rename it.

### An initiative can move to another project

`docs/target-data-model.md` says that the project of an initiative does not change after the initiative is created. We do not follow that rule, because the migration puts every existing initiative in "Unsorted", and the user must be able to move them. A user can also create an initiative in the wrong project by mistake.

When an initiative moves to another project, every meeting that is assigned to it moves to that project too. This keeps the rule that a meeting's initiative belongs to the meeting's project, and it keeps the history of the initiative together. The move:

- is refused if the target project is deleted or does not exist,
- answers `nameTaken` and changes nothing if an initiative of the target project that is not deleted has the same name,
- changes the `updated_at` of the initiative, because the user changed a property of it, and the `updated_at` of each meeting that moved,
- does not change the column or the rank of the initiative. The roadmap is one board across all projects, so the place of the card stays.

When `meeting_initiatives` replaces `meetings.initiative_id` in a later ticket, a meeting can cover initiatives of one project only. Then a move of an initiative must decide again what happens to meetings that also cover other initiatives. This ADR does not decide that case.

### Rules that the backend enforces

The database enforces the foreign keys and the unique names. The backend enforces the rules that involve more than one row:

- **The initiative of a meeting belongs to its project.**
  - `set_meeting_initiative` with an initiative also sets the project of the meeting to the project of that initiative. The frontend offers only initiatives of the meeting's project, so this changes the project only if the frontend is out of date. It also makes the rule hold for every caller.
  - `set_meeting_project` clears the initiative of the meeting when the project changes. Setting the project that the meeting already has changes nothing, not even `updated_at`.
  - A meeting can be about a deleted project. It keeps the link, so that the delete can be undone. `set_meeting_project` refuses to set a deleted project, but a meeting that already has one keeps it until the user chooses another one.
- **A project with initiatives cannot be deleted.** `delete_project` answers `hasInitiatives` and changes nothing if the project has an initiative that is not deleted. Completed initiatives count, because they are still shown in Done. Deleted initiatives do not count, because the user no longer sees them. The meetings of a deleted project keep their `project_id`.
- **A deleted initiative cannot come back into a deleted project.** A user can delete an initiative, then delete its project, which has no other initiatives, and then click "Undo" in a toast of the initiative. `restore_initiative` then answers `projectDeleted` and changes nothing. The toast says `Couldn't restore "<name>" because its project is deleted.` and has no "Undo" button. This keeps the rule that every initiative that is not deleted belongs to a project that is not deleted, so the roadmap can always show the name of its project.
- **Unique names on restore.** `restore_project` answers `nameTaken` and changes nothing if another project that is not deleted has the same name, in the same way as `restore_initiative` (ADR 0013). `restore_initiative` answers `nameTaken` when another initiative of the same project has the name.
- **A new initiative needs a project.** `create_initiative` takes a `projectId` and refuses a project that is deleted or does not exist.

### Commands

The new module `src-tauri/src/projects.rs` holds all SQL for projects, and `src/lib/projects.ts` holds the types and the only `invoke` calls for projects. The new commands are:

| Command                  | Arguments                   | Result                                                                          |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------- |
| `list_projects`          | `includeDeleted`            | list of projects                                                                |
| `create_project`         | `name`, `description`       | `{ status: "created", project }` or `{ status: "nameTaken" }`                    |
| `get_project`            | `id`                        | the project, or `null`                                                          |
| `rename_project`         | `id`, `name`                | `{ status: "renamed", project }` or `{ status: "nameTaken" }`                    |
| `update_project`         | `id`, `description`         | the project                                                                     |
| `delete_project`         | `id`                        | `{ status: "deleted" }` or `{ status: "hasInitiatives" }`                       |
| `restore_project`        | `id`                        | `{ status: "restored" }` or `{ status: "nameTaken" }`                           |
| `set_initiative_project` | `id`, `projectId`           | `{ status: "moved", initiative }` or `{ status: "nameTaken" }`                  |
| `set_meeting_project`    | `id`, `projectId` or `null` | the meeting                                                                     |

A project has `id`, `name`, `description`, `createdAt`, `updatedAt`, and `deletedAt`. `list_projects` returns the description too, because the number of projects is small.

`create_project` refuses a project with an empty name and an empty description, as `create_initiative` refuses a draft that the user did not change.

The existing commands change as follows:

- `create_initiative` takes `projectId`.
- An initiative and its summary have `projectId`.
- A meeting and its summary have `projectId`.
- `restore_initiative` can also answer `{ status: "projectDeleted" }`.

The project page lists the initiatives and the meetings of a project by filtering the results of `list_initiatives` and `list_meetings` on the frontend. The user has few projects, initiatives, and meetings, and this avoids two commands that would do the same as a filter. If the lists grow large, a command that filters in SQL can replace the filter without a change to the pages.

## Consequences

- The data model matches the target data model for projects, except that an initiative can move to another project.
- After the update, every existing initiative is in "Unsorted". The user sees it on the cards and in the filter of the roadmap until they move the initiatives.
- The rule that a meeting's initiative belongs to the meeting's project lives in the backend, in `set_meeting_initiative`, `set_meeting_project`, and `set_initiative_project`. A new command that changes these columns must keep it too. The unit tests of these functions check the rule.
- `delete_project` and `restore_initiative` get new answers, so the delete provider on the frontend must show them (ADR 0020).
- Filtering on the frontend loads every initiative and meeting for a project page. This is fast for the expected amounts of data.

## Alternatives considered

- **The project of an initiative never changes**, as the target data model says. The user would have to recreate every existing initiative to put it in its real project, and would lose the links of its meetings.
- **An initiative can move only out of "Unsorted".** This follows the target data model after the first move, but it needs a special project that the code must know by name or by a flag, and it does not help when the user chooses the wrong project for a new initiative.
- **Moving an initiative clears the initiative of its meetings**, instead of moving the meetings. The meetings would lose the link that the user made.
- **A check in the database for the rule that a meeting's initiative belongs to its project**, with triggers. Triggers are harder to read and test than the backend functions, and the backend already enforces similar rules, such as the restore of a deleted initiative.
- **No project for the existing initiatives, with `project_id` nullable until the user sorts them.** Every part of the code would need to handle initiatives without a project, and the ticket says that every initiative belongs to one project.
