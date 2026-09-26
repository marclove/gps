# 13. Store initiatives in their own table and link meetings to them

Date: 2026-09-26

## Status

Accepted

## Context

Feature ticket 0006 asks for a way to record the company initiatives that the user has a responsibility in. An initiative is a larger piece of company work, such as a product launch or a migration. For each initiative, the user records a name, a description, and their role in it. The user can then assign each meeting to the initiative that the meeting was about, so that later they can see how their work contributed to the initiative.

The user's role follows the RACI model, which companies use to say who does what in a project. RACI has four roles:

- **Responsible**: the person who does the work.
- **Accountable**: the person who answers for the result and approves it.
- **Consulted**: a person whose opinion is asked before a decision.
- **Informed**: a person who is told about the progress and the decisions.

The ticket gives a draft of the data: an `initiatives` table with a name, a description, a role, three timestamps, and a reference from each meeting to at most one initiative. The description is written in the same TipTap editor as the notes of a meeting and is stored as Markdown, as ADR 0004 decided for notes.

The Rust backend owns the SQLite database (ADR 0003), and the frontend changes data only through named backend commands. A meeting is archived by recording the time in `archived_at` (ADR 0008). The user asked for initiatives to be archived in the same way, with the same "Undo" button.

We had to decide:

- how the database stores initiatives, their roles, and the link from a meeting,
- which commands the frontend uses to read and change initiatives,
- how the user's choice of an initiative for a meeting is saved,
- what happens to the meetings of an initiative that is archived.

## Decision

### Table

A new migration creates the table `initiatives`:

| Column        | Type                     | Meaning                                                                                                   |
| ------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `id`          | `INTEGER` primary key    | The identifier that SQLite assigns.                                                                       |
| `name`        | `TEXT NOT NULL`          | The name. A new initiative gets the name "Untitled initiative".                                           |
| `description` | `TEXT NOT NULL`, default `''` | The description, as Markdown.                                                                        |
| `raci_role`   | `TEXT`, may be `NULL`    | The user's role: `responsible`, `accountable`, `consulted`, or `informed`. `NULL` until the user chooses one. |
| `created_at`  | `TEXT NOT NULL`          | When the initiative was created, as an RFC 3339 timestamp in UTC.                                         |
| `updated_at`  | `TEXT NOT NULL`          | When the name, the description, or the role last changed, as an RFC 3339 timestamp in UTC.                |
| `archived_at` | `TEXT`, may be `NULL`    | `NULL` while the initiative is not archived. Otherwise, when it was archived, as an RFC 3339 timestamp in UTC. |

- A `CHECK` constraint on `raci_role` accepts only `NULL` and the four values above, in lowercase. The backend also checks the value before it writes it, so that the frontend gets a clear message instead of a constraint error.
- The draft in the ticket allows an empty description. We store an empty text instead of `NULL`, as for the notes of a meeting, so that the frontend never has to handle two kinds of "empty".

The same migration adds a column to `meetings`:

| Column          | Type                     | Meaning                                                                        |
| --------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `initiative_id` | `INTEGER`, may be `NULL` | The initiative that the meeting is assigned to. It refers to `initiatives(id)`. |

- An index on `initiative_id` makes it fast to find the meetings of an initiative later.
- A meeting is assigned to at most one initiative.
- The database enforces foreign keys (ADR 0010), so `initiative_id` must refer to an initiative that exists. The reference has no `ON DELETE` action. The application does not delete initiatives.

### Archiving

- Archiving an initiative works like archiving a meeting (ADR 0008). `archived_at` gets the current time, or keeps the time that is already stored. Restoring sets it back to `NULL`. Neither changes `updated_at`.
- Archiving an initiative does not change its meetings. They stay assigned to it.
- The list of initiatives leaves out archived initiatives. The select box that assigns a meeting to an initiative includes them, so that a meeting that is assigned to an archived initiative shows that assignment, and so that the user can assign the meeting to it again after choosing a different initiative by mistake.

### Commands

The backend gets a new module, `src-tauri/src/initiatives.rs`, with all SQL for initiatives. The frontend gets `src/lib/initiatives.ts`, with the types and the only `invoke` calls for initiatives.

| Command                  | Arguments                                   | Result                                                   |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------- |
| `list_initiatives`       | `includeArchived`                           | summaries of initiatives, the newest first               |
| `create_initiative`      | none                                        | the new initiative                                       |
| `get_initiative`         | `id`                                        | the initiative, or `null` if no initiative has the identifier |
| `update_initiative`      | `id`, `name`, `description`, `raciRole`     | the initiative after the change                          |
| `archive_initiative`     | `id`                                        | nothing (`null`)                                         |
| `unarchive_initiative`   | `id`                                        | nothing (`null`)                                         |
| `set_meeting_initiative` | `id` (of the meeting), `initiativeId`       | the meeting after the change                             |

- An initiative, as the commands return it, has the fields `id`, `name`, `description`, `raciRole`, `createdAt`, `updatedAt`, and `archivedAt`. `raciRole` is one of the four lowercase values or `null`.
- A summary has the fields `id`, `name`, `raciRole`, `updatedAt`, and `archivedAt`. It does not have the description.
- `list_initiatives` with `includeArchived: false` returns only the initiatives that are not archived. With `includeArchived: true`, it returns all initiatives. Both are sorted by `created_at`, the newest first, then by `id`, the highest first.
- `update_initiative` replaces the name, the description, and the role together, and changes `updatedAt`.
- `set_meeting_initiative` takes `initiativeId: null` to remove the assignment. It changes the meeting's `updatedAt`, because the assignment is a change to the meeting that the user made.
- The `Meeting` type gets the field `initiativeId`, a number or `null`. `get_meeting` and `update_meeting` return it. `update_meeting` does not change it.
- The commands fail with a message when no initiative or meeting has the identifier, when the role is not one of the four values, or when the database reports an error.

### Saving

- On the editor page of an initiative, the name, the description, and the role are saved together and automatically, 500 milliseconds after the last change, with the same `useAutosave` hook that saves a meeting. The role is a property of the initiative, like the date of a meeting.
- On the editor page of a meeting, a change in the select box of initiatives is saved at once with `set_meeting_initiative`, like a click on the checkbox of an action item (ADR 0010). If the save fails, the select box shows the value that was saved last again, and a failure toast reports it (ADR 0012).

## Consequences

- The name, date, and notes of a meeting keep the save path that they have today. A change of the initiative cannot be overwritten by the automatic save of the notes, and the automatic save cannot send an old initiative, because the two are saved by different commands that change different columns.
- A later page can list the meetings of an initiative with a query on `meetings.initiative_id`, without another migration.
- Every query that lists initiatives must decide whether it includes archived initiatives. Keeping all SQL for initiatives in `initiatives.rs` makes this easy to check.
- The fake backends of earlier feature specs that open the meeting editor page must answer `list_initiatives`, and their meetings must have `initiativeId`.
- `docs/data-model.md` gets the new table, the new column, and the relationship.

## Alternatives considered

- Save the initiative of a meeting with `update_meeting`, together with the name, date, and notes. There would be one way to save a meeting, but every earlier fake backend would need to accept and return the new argument, and a change in the select box would wait for the delay of the automatic save although it is a single click.
- A free text column for the role. The user could write anything, but the ticket names the RACI model, and four fixed values can be grouped and counted later.
- A `raci_roles` table with one row for each role. Four values that do not change do not need their own table, and a `CHECK` constraint keeps the data correct.
- A table that links meetings and initiatives, so that a meeting can belong to many initiatives. The ticket asks for one initiative for each meeting, and a column is simpler. A later feature can add the table with a new migration if a meeting needs more than one initiative.
- Leave archived initiatives out of the select box of a meeting. A meeting that is assigned to an archived initiative would show an empty choice, and the user could not assign a meeting to that initiative again after a mistake.
