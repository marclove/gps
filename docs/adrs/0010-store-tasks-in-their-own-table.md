# 10. Store tasks in their own table, with one command for each change

Date: 2026-09-26

## Status

Accepted

## Context

The feature ticket 0005 asks for a way to record action items on the meeting screen. An action item is a piece of work that the user was given in a meeting. The user adds action items to a checklist in a panel at the right side of the meeting's editor page, checks them off when the work is done, changes their text, and removes them.

The ticket calls an action item a "task" and gives a draft of the data: a `tasks` table with an identifier, a description, a reference to a meeting, and three timestamps. The reference to a meeting may be empty. This tells us that tasks will later exist without a meeting, for example in a work tracker page that shows tasks as cards in columns (ADR 0005 mentions such a page).

The Rust backend owns the SQLite database (ADR 0003). The frontend changes data only through named backend commands. The meeting editor already saves the name, date, and notes of a meeting automatically with one command, `update_meeting`.

We had to decide:

- how the database stores tasks and links them to meetings,
- which commands the frontend uses to read and change tasks,
- how saving tasks relates to saving the meeting.

## Decision

### Words

In the user interface, the word is "action item", because that is the usual word for work that comes out of a meeting. In the database, in the backend, and in the frontend data module, the word is "task", because a task will later exist without a meeting. The frontend components for the panel on the meeting page use "action item".

### Table

A new migration creates the table `tasks`:

| Column         | Type                | Meaning                                                                                                   |
| -------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`           | `INTEGER` primary key | The identifier that SQLite assigns.                                                                      |
| `meeting_id`   | `INTEGER`, may be `NULL` | The meeting in which the task was recorded. It refers to `meetings(id)`.                             |
| `description`  | `TEXT NOT NULL`     | The text of the task.                                                                                     |
| `created_at`   | `TEXT NOT NULL`     | When the task was created, as an RFC 3339 timestamp in UTC.                                               |
| `updated_at`   | `TEXT NOT NULL`     | When the description or the completion last changed, as an RFC 3339 timestamp in UTC.                     |
| `completed_at` | `TEXT`, may be `NULL` | `NULL` while the task is not done. When the user checks the task off, the time of that change, as an RFC 3339 timestamp in UTC. |

- An index on `meeting_id` makes it fast to find the tasks of one meeting.
- When the user checks a task off, `completed_at` gets the current time. If the task is already checked off, the time that is already stored stays. When the user unchecks the task, `completed_at` becomes `NULL` again. We use a timestamp instead of a true or false value for the same reason as `archived_at` in ADR 0008: a later page can show when work was done.
- Archiving a meeting does not change its tasks.
- The tasks of a meeting are shown in the order in which they were created: oldest first, by `created_at`, then by `id`. There is no column for a custom order, because the user cannot reorder tasks.

### Foreign keys

SQLite checks that `meeting_id` refers to a real meeting only when the setting `foreign_keys` is on for the connection. In standard SQLite, this setting is off by default and is not stored in the database file. The copy of SQLite that `rusqlite` compiles into the application (its `bundled` feature) turns it on by default, but we do not want the check to depend on how SQLite was compiled. So `db::open` and `db::open_in_memory` run `PRAGMA foreign_keys = ON` before they apply the migrations. After this change:

- Creating a task for a meeting that does not exist fails.
- The reference has no `ON DELETE` action. The application does not delete meetings. If a later feature deletes meetings, SQLite refuses to delete a meeting that still has tasks, and that feature must decide what happens to them.

### Commands

The backend gets a new module, `src-tauri/src/tasks.rs`, with all SQL for tasks. The frontend gets `src/lib/tasks.ts`, with the `Task` type and the only `invoke` calls for tasks. There is one command for each change that the user makes:

| Command                   | Arguments                  | Result                                   |
| ------------------------- | -------------------------- | ---------------------------------------- |
| `list_meeting_tasks`      | `meetingId`                | the tasks of the meeting, oldest first   |
| `create_task`             | `meetingId`, `description` | the new task                             |
| `update_task_description` | `id`, `description`        | the task after the change                |
| `set_task_completed`      | `id`, `completed`          | the task after the change                |
| `delete_task`             | `id`                       | nothing (`null`)                         |

A task, as the commands return it, has the fields `id`, `meetingId` (a number or `null`), `description`, `createdAt`, `updatedAt`, and `completedAt` (a timestamp or `null`). The commands fail with a message when no task has the identifier, when the meeting does not exist, or when the database reports an error. `delete_task` deletes the row permanently.

### Saving

The panel of action items loads and saves tasks by itself, separately from the meeting's name, date, and notes:

- Adding, checking, unchecking, and removing an item each send one command at once.
- Changes to the text of an item are saved automatically, 500 milliseconds after the last change, with the same `useAutosave` hook that saves the meeting. Each item has its own autosave. A change that is waiting when the page closes is saved then.
- The `Meeting` type and the meeting commands do not change.

## Consequences

- Tasks are ready to be shown outside meetings. A later page can list tasks with other queries in `tasks.rs`, and tasks without a meeting need no change to the table.
- Each command changes one row, so a change to one item cannot overwrite another item, and every task keeps its identifier and `created_at`.
- The panel has its own states for loading and for errors, apart from the meeting's save status in the page header. A problem with tasks does not stop the user from writing notes.
- Foreign keys are now checked for every table. Later migrations that add references get this check without extra work.
- The frontend, the fake backends in the feature specs, and the Rust backend must implement the five new commands in the same way. The fake backends of earlier feature specs that open the editor page must answer `list_meeting_tasks`.
- `Database::run` in `lib.rs` accepts errors only from the meetings module today. It must accept errors from the tasks module too.

## Alternatives considered

- Return the tasks with the meeting from `get_meeting`, and save the whole list of tasks with `update_meeting`. There would be one way to save, but every save would rewrite all tasks of the meeting. The identifiers and creation times of tasks would be lost or would need extra work to keep, and tasks without a meeting would need a different set of commands anyway.
- Store action items as a checklist inside the Markdown notes, with TipTap's task list. This needs no table, but the ticket asks for a separate panel and a `tasks` table, and tasks inside notes cannot be listed across meetings without parsing all notes.
- A single `update_task` command that replaces the description and the completion together. The text of an item is saved after a delay, but a click on its checkbox is saved at once. With one command, a checkbox click could send an old description, or a text save could undo a checkbox click that happened during the delay.
- A column `completed` of type `INTEGER` that holds 0 or 1. It does not record when the work was done.
- A column for the position of each task, so that the user can drag tasks into a new order. The ticket does not ask for this, and it can be added later with a new migration.
