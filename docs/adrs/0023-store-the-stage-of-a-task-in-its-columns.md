# 23. Store the stage of a task in its columns, and order prioritized tasks as one list

Date: 2026-09-29

## Status

Proposed

Supersedes the permanent delete of tasks in [ADR 0010](0010-store-tasks-in-their-own-table.md), the rule of ADR 0010 that checking a task off changes its `updated_at`, and the command `create_task` of ADR 0010, which `create_meeting_task` replaces. Adds a second refusal to the delete of a project in [ADR 0019](0019-store-projects-and-place-each-initiative-in-one.md): a project that still has tasks cannot be deleted.

## Context

Feature ticket 0010 adds the Work section: one place for every task that the user must do. Spec 0010 describes what the user sees. In short:

- A task is in one of four **stages**: Icebox, Backlog, Current, or Done. The board of the Work page shows them as four columns, from left to right: Current, Backlog, Icebox, and Done.
- A new task waits in the **Icebox**. The Icebox has no order of its own. It shows the newest task first.
- Backlog and Current are **one ordered list** of **prioritized** tasks. Current shows the tasks of that list that the user has started, and the Backlog shows the others, each in the order of the list. The task at the top of the Backlog is the next piece of work to start.
- **Done** holds the completed tasks, the task completed last first.
- A completed or deleted task keeps its **held place**: its place in the list. When the user reopens it or undoes its delete, it goes back there. If another task has taken that place, it goes directly after that task.
- A task can have a Markdown description, a project, and an initiative of that project. An action item of a meeting is a task, and a new action item gets the project and, in some cases, the initiative of its meeting.
- Deleting a task can be undone. Today a task is deleted for good (ADR 0010).
- A project that still has tasks cannot be deleted.

Today the table `tasks` has `id`, `meeting_id`, `title`, `created_at`, `updated_at`, and `completed_at` (see `docs/data-model.md`). `docs/target-data-model.md` already describes the new columns, and its section "How tasks move" describes how the stages follow from them. The ticket gives the same draft.

Three earlier decisions matter here:

- Only the backend makes rank keys. A rank is a short text key, such as `8` or `c4`, that sorts in the order of the cards. There is always a key between two keys, so a moved card gets a new key and no other row changes. The frontend sends the column and the index of a drop, and never computes a key (ADR 0017). The module `src-tauri/src/rank.rs` makes keys with the function `rank::between`.
- Migrations run while foreign keys are off. Each migration that changes a table ends with a foreign key check (ADR 0017).
- The backend keeps each rule that involves more than one row inside one transaction (ADR 0019, ADR 0021).

We had to decide:

- how the table stores the stage and the order of a task,
- how the migration turns the existing action items into tasks,
- which commands the frontend uses,
- how the index of a drop in Current or the Backlog becomes a rank,
- how the backend keeps the project and the initiative of a task consistent,
- what changes in the existing commands.

## Decision

### The stage is not a column

The table has no `stage` column. The stage follows from four columns, as in "How tasks move" in `docs/target-data-model.md`:

| Stage   | Columns                                                          | Order                                         |
| ------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Current | `rank` is set, `started_at` is set, not completed, not deleted   | By `rank`                                     |
| Backlog | `rank` is set, `started_at` is null, not completed, not deleted  | By `rank`                                     |
| Icebox  | `rank` is null, `started_at` is null, not completed, not deleted | By `created_at`, the newest first             |
| Done    | `completed_at` is set, not deleted                               | By `completed_at`, the task completed last first |
| Deleted | `deleted_at` is set                                              | Not shown                                     |

The held place of a task is simply its `rank` and `started_at`, which completing and deleting leave as they are. A separate stage column would have to change together with these columns in every command, and a restore would still need the rank. With the stage derived, a task cannot be in a stage that its columns contradict.

### The table

The table `tasks` gets six new columns:

| Column          | Meaning                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `description`   | `TEXT NOT NULL DEFAULT ''`. Markdown, like the notes of a meeting (ADR 0004).                                            |
| `project_id`    | May be null. Refers to `projects.id`. Null for a task on no project.                                                     |
| `initiative_id` | May be null. Refers to `initiatives.id`. Null for a task on no initiative. The initiative belongs to the project of the task. |
| `rank`          | `TEXT`, may be null. A rank key (ADR 0017). Null while the task is in the Icebox.                                        |
| `started_at`    | May be null. The time when the user started the task, as an RFC 3339 timestamp in UTC.                                   |
| `deleted_at`    | May be null. The time when the user deleted the task, as an RFC 3339 timestamp in UTC.                                   |

A check constraint, `CHECK (started_at IS NULL OR rank IS NOT NULL)`, says that a started task has a rank. Every command below keeps this true, and the check makes a mistake in a later command fail at once instead of leaving a task that no column shows.

The indexes are:

- `tasks_rank`, a partial unique index on `rank` `WHERE rank IS NOT NULL AND completed_at IS NULL AND deleted_at IS NULL`. No two prioritized tasks share a place in the list. Completed and deleted tasks are left out, because they keep their held place while another task can take it.
- `tasks_project_id` on `project_id` and `tasks_initiative_id` on `initiative_id`, so that the backend finds the tasks of a project or of an initiative quickly: when it deletes a project, and when it moves an initiative to another project.
- `tasks_meeting_id` on `meeting_id`, as before.

### The migration

One new migration, number 12, is added at the end of `MIGRATIONS` in `src-tauri/src/db.rs`. It rebuilds `tasks`, in the same way as the migrations of ADR 0017, ADR 0019, and ADR 0021 rebuilt `initiatives` and `meetings`: it creates `tasks_new` with all columns, the foreign keys, and the check constraint, copies every row with the same identifier, drops `tasks`, renames `tasks_new` to `tasks`, and creates the indexes. It ends with `.foreign_key_check()`.

SQLite can add a nullable column that refers to another table with `ALTER TABLE ... ADD COLUMN`, but it cannot add a check constraint to a table that exists. The rebuild also puts the whole definition of the table in one statement, in the order of the columns in `docs/data-model.md`.

For each existing task, the migration sets:

- `title`, `meeting_id`, `created_at`, `updated_at`, and `completed_at` as they were,
- `description` to empty text,
- `project_id` to the project of its meeting, also when the meeting is deleted, unless the project is deleted. A task that is not deleted never belongs to a deleted project, which is the rule that the refusal `hasTasks` below keeps for later deletes,
- `initiative_id` to the initiative of its meeting when the meeting covers exactly one initiative that is not deleted, and otherwise to null,
- `rank`, `started_at`, and `deleted_at` to null.

So an open action item is in the Icebox, and a checked one is in Done. A reopened action item goes to the Icebox, because it has no rank. Every existing task was recorded in a meeting, so every task that has a project got it from its meeting.

The migration and `create_meeting_task` follow one rule: they count only initiatives that are not deleted, so a meeting that covers a deleted initiative and one other initiative gives its tasks that other initiative. The rows of `meeting_initiatives` always belong to the project of the meeting (ADR 0021), so the initiative always belongs to the project that the task gets.

### Commands

`src-tauri/src/tasks.rs` keeps all SQL for tasks, and `src/lib/tasks.ts` keeps the `Task` type and the only `invoke` calls for tasks. A task, as the commands return it, has `id`, `meetingId`, `title`, `description`, `projectId`, `initiativeId`, `rank`, `createdAt`, `updatedAt`, `startedAt`, `completedAt`, and `deletedAt`. The frontend sorts the columns of the board itself, from `rank`, `createdAt`, and `completedAt`, as the roadmap does (ADR 0017).

| Command                   | Arguments                                           | Result                                                                 |
| ------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `list_tasks`              | none                                                | the tasks that are not deleted, in any order                           |
| `get_task`                | `id`                                                | the task, also a deleted one, or `null`                                |
| `create_task`             | `title`, `description`, `projectId`, `initiativeId` | the task, in the Icebox                                                |
| `create_meeting_task`     | `meetingId`, `title`                                | the task, in the Icebox, with the project and initiative of the meeting |
| `update_task_title`       | `id`, `title`                                       | the task                                                               |
| `update_task_description` | `id`, `description`                                 | the task                                                               |
| `set_task_project`        | `id`, `projectId` or `null`                         | the task                                                               |
| `set_task_initiative`     | `id`, `initiativeId` or `null`                      | the task                                                               |
| `move_task`               | `id`, `destination`, `index`                        | the task                                                               |
| `start_task`              | `id`                                                | the task                                                               |
| `set_task_completed`      | `id`, `completed`                                   | the task                                                               |
| `delete_task`             | `id`                                                | nothing (`null`)                                                       |
| `restore_task`            | `id`                                                | the task                                                               |

`list_meeting_tasks` stays, and now returns only the tasks of the meeting that are not deleted. The project page and the sheet of an initiative find their tasks by filtering the result of `list_tasks` on the frontend, as ADR 0019 does for the initiatives and meetings of a project. The user has few tasks, and a command that filters in SQL can replace the filter later without a change to the pages.

We keep one command for each change, for the reason of ADR 0010: the title and the description are saved after the user pauses, but a choice of project, a drag, or a click on "Start" is saved at once. A single command that writes the whole task could send an old title with a new project, or undo a drag that happened while a title waited to be saved. Each command writes only the columns that its change is about.

Every command runs in one transaction, and fails with a message when no task has the identifier.

#### Creating

- `create_task` removes the spaces at the start and the end of the title. When `initiativeId` is not null, the task gets the project of that initiative, whatever `projectId` is, so the rule below holds for every caller. It refuses a project or an initiative that is deleted or does not exist. It refuses a task whose title, description, project, and initiative are all empty, as `create_project` refuses a draft that the user did not change (ADR 0019). The "Add task" field of the Icebox never sends an empty title, and the sheet saves a draft only after a real change.
- `create_meeting_task` replaces the `create_task` of ADR 0010. It refuses a meeting that does not exist. The task gets the project of the meeting, unless that project is deleted, with the same rule as the migration. It gets an initiative only when the meeting covers exactly one initiative that is not deleted, with the same rule as the migration. The backend applies these defaults, not the frontend, so that the action items panel stays one call, and a meeting whose initiatives changed in another window cannot give a default that is out of date.

A new task is in the Icebox: `rank` and `started_at` are null.

#### Moving

`move_task` has the same shape as `move_initiative` (ADR 0017): the frontend sends the column where the card dropped and the index among the cards of that column, and the backend makes the key. `destination` is `"current"`, `"backlog"`, `"icebox"`, or `"done"`. `move_task` refuses a task that is completed or deleted: the board does not let the user drag a card out of Done, and the "Reopen" button uses `set_task_completed`.

- **To Current or the Backlog.** `index` is the place among the cards of that column, counted from 0 without the moved task. Values below 0 count as 0, and values above the number of cards count as that number. The task gets a rank, as described in the next section, and `started_at` is set for Current, keeping a time that is already there, or cleared for the Backlog. A task from the Icebox is prioritized by this move.
- **To the Icebox.** `rank` and `started_at` become null. `index` is ignored, because the Icebox is sorted by `created_at`. A task that is already in the Icebox does not change.
- **To Done.** `completed_at` gets the current time. `rank` and `started_at` stay, so the task keeps its held place. `index` is ignored. This has the same effect as `set_task_completed` with `true`. The board uses `move_task` for every drop, so that it has one path for drops.

#### How an index becomes a rank

Current and the Backlog are two filtered views of one list: the prioritized tasks, sorted by `rank`. An index counts only the cards of one column, but the key must fit in the whole list. The backend reads the prioritized tasks without the moved one, in the order of their ranks, and takes the cards of the destination column from them. Then:

- if a card of the column is above the index, the task goes directly after that card in the list,
- otherwise, if the column has a card below the index, which is its first card, the task goes directly before that card in the list,
- otherwise, the column has no other card, and the task goes to the end of the list.

"Directly after a card" means a key between the rank of that card and the rank of the next task in the whole list, which may be a card of the other column. "Directly before" works the same way with the previous task. `rank::between` makes the key. Only the moved row is written. The order of the other cards does not change, in either column.

This is the rule of the filtered roadmap (ADR 0020). There, the frontend turns the place among the shown cards into an index among all cards of the column (`fullIndex` in `src/features/initiatives/board.ts`), because the filter is a choice of the page that the backend does not know, and `move_initiative` already worked. Here the filter is fixed by the stage, which the backend derives itself from `started_at`. The backend reads the list in the same transaction as the write, so it places the task among the tasks as they are stored, and not among a copy on the frontend that another move may have made out of date. The frontend and the fake backend of the specs then only need the index that dnd-kit gives.

#### Starting, completing, reopening

- `start_task` sets `started_at` of a task in the Backlog and keeps its rank, so it appears in Current at its place in the list. It refuses a task in any other stage.
- `set_task_completed` with `true` completes the task in any stage: `completed_at` gets the current time, and `rank` and `started_at` stay. A task that is already completed keeps the time that was recorded first. This is the checkbox of an action item, and it gives the same result as a drop in Done.
- `set_task_completed` with `false` reopens the task: `completed_at` becomes null, and the task goes back to its held place. A task with a rank goes back to Current when it has `started_at`, and to the Backlog when it has not. A task without a rank goes back to the Icebox. If a prioritized task has the same rank by then, the reopened task gets a key between that rank and the next rank in the list, so it appears directly after that task. This is the rule that `initiatives::restore` follows for a restored initiative (ADR 0017). This is the "Reopen" button, and the unchecking of an action item. Reopening a task that is not completed changes nothing.
- `set_task_completed` refuses a deleted task.

#### Deleting and restoring

- `delete_task` sets `deleted_at` and keeps every other column, so that the task keeps its stage and its held place. It no longer removes the row. Deleting a task that is already deleted keeps the time that was recorded first. A deleted task leaves the board, the list of its meeting, the project page, and the sheet of its initiative.
- `restore_task` clears `deleted_at`. The task goes back to its stage. A task in Current or the Backlog goes back to its held place with the rule for reopening, including the case where its rank is taken. A completed task goes back to Done. Restoring a task that is not deleted changes nothing.

`restore_task` does not refuse a task whose project was deleted in the meantime. Deleted tasks do not stop a project from being deleted, so this can happen in principle. In practice the delete provider shows one delete toast at a time, so deleting a project closes the toast that could restore a task, and no page restores a task later.

### The project and the initiative of a task

The rule, from rule 2 of "Rules that the backend keeps" in `docs/target-data-model.md`: **when a task has an initiative, it has the project of that initiative.** Both columns are stored, so "all tasks of this project" is one condition. The backend keeps the rule in every command that changes either column, each in one transaction:

- `set_task_initiative` with an initiative sets `initiative_id`, and sets `project_id` to the project of the initiative. With `null`, it clears `initiative_id` and keeps the project. It refuses an initiative that is deleted or does not exist.
- `set_task_project` with a project sets `project_id`, and clears `initiative_id` when the initiative belongs to another project. With `null`, it clears both. It refuses a project that is deleted or does not exist.
- Setting the project or the initiative that the task already has changes nothing, not even `updated_at`.
- A task keeps a project or an initiative that is deleted after the user chose it. Only the choice of a deleted one is refused. The sheet then shows it with " (deleted)" after its name.
- `initiatives::set_project`, the command `set_initiative_project` that moves an initiative to another project (ADR 0019), also sets `project_id` of every task of the initiative, also the completed and the deleted ones, and changes their `updated_at`. It does this in the same transaction as the move. A deleted task that is restored later then still has the project of its initiative.

`docs/target-data-model.md` says that an initiative never changes its project. ADR 0019 chose to let initiatives move, and this ADR follows ADR 0019: tasks move with their initiative, as meetings that cover only that initiative do (ADR 0021). The meeting of a task does not decide its project after the task is created. A task and its meeting can be about different projects.

### Deleting a project

`projects::delete` gets a third outcome, `HasTasks`, which the command answers as `{ status: "hasTasks" }`. It answers it, and changes nothing, when the project has a task that is not deleted, also a completed one. Deleted tasks do not count, because the user no longer sees them. The check comes after the check for initiatives, so a project that has both initiatives and tasks answers `hasInitiatives`, as it does today. Completed tasks count for the same reason that completed initiatives count in ADR 0019: they are still shown, in Done.

### `updated_at`

`updated_at` of a task changes when the user changes its content: the title, the description, the project, or the initiative. Moving, starting, completing, reopening, deleting, and restoring do not change it. This follows the conventions of `docs/target-data-model.md` and the roadmap, where moving and completing an initiative leave `updated_at` alone (ADR 0017).

This changes the behavior of ADR 0010, where checking an action item off changes `updated_at`. A task can now be completed from two places, and its stage already records the time of each change of stage in `started_at` and `completed_at`. No page shows `updated_at` of a task today.

## Consequences

- The data model of tasks matches `docs/target-data-model.md`. `docs/data-model.md` shows the new columns, the check constraint, and the new relationships to projects and initiatives.
- Existing action items keep their title, meeting, and completion. They are all in the Icebox or in Done after the update, and the user prioritizes them by dragging.
- A meeting about a deleted project gives its new and existing action items no project. The user can choose one in the task sheet.
- The database refuses two prioritized tasks with the same rank, and a started task without a rank. The backend alone keeps the rule about the project of an initiative, in `set_task_project`, `set_task_initiative`, `create_task`, `create_meeting_task`, and `initiatives::set_project`. The unit tests of these functions in `src-tauri/src/tasks.rs` and `src-tauri/src/initiatives.rs` check it. A new command that changes these columns must keep it too.
- A task can no longer be deleted for good. Rows of `tasks` are never removed, so a later page can show deleted tasks.
- `projects::delete` reads `tasks`, and the delete provider must show the new refusal (ADR 0025).
- Nine commands are new: `list_tasks`, `get_task`, `create_meeting_task`, `update_task_description`, `set_task_project`, `set_task_initiative`, `move_task`, `start_task`, and `restore_task`. Six change: `create_task`, `set_task_completed`, `delete_task`, `list_meeting_tasks`, `delete_project`, and `set_initiative_project`. The Rust backend, `src/lib/tasks.ts`, and the fake backends of the executable specs must implement them in the same way. The fake backends of the earlier specs that call `create_task` for action items must answer `create_meeting_task` instead.
- Keys get longer when tasks keep going into the same gap, as ADR 0017 describes for the roadmap. The list of tasks is longer than a column of the roadmap, but a key still grows by about one digit for every four inserts into one gap.

## Alternatives considered

- **A `stage` column** with the values `icebox`, `backlog`, `current`, and `done`. A query for one stage would be simpler, but every command would write the stage and the columns that it depends on together, and the two could disagree. A reopened or restored task would still need its rank and its start to return to its held place.
- **Separate lists for Current and the Backlog**, each with its own ranks. Starting a task would then need a new key in Current, and the ticket asks for one list, in which a started task keeps its place.
- **A command for each change of stage**, such as `prioritize_task`, `unprioritize_task`, and `complete_task`, in place of `move_task`. The board would have to choose the command from the column where the card came from and the column where it dropped. `move_task` takes what dnd-kit gives, as `move_initiative` does. `start_task` and `set_task_completed` stay separate, because the "Start" and "Reopen" buttons and the checkbox of an action item have no drop and no index.
- **Integer positions** for the list. ADR 0017 replaced them with ranks, because a move writes many rows and the database cannot enforce the order.
- **Keep the permanent delete.** The ticket asks for an "Undo", as for meetings and initiatives, and for the task to return to its held place, which needs the row.
- **Let the frontend turn the index into an index among the whole list**, as the filtered roadmap does. The frontend would send an index among all prioritized tasks, and `move_task` could place a task with the same code as `move_initiative`. But the frontend would compute the place from its copy of the list, which can be out of date after a failed or a pending move, and the fake backend of the specs would need the same translation. The backend knows the stages, so it can do the translation on the stored rows.
- **Let the frontend give a new action item its project and initiative**, with `create_task`. The action items panel would have to load the meeting's project and initiatives before the first item, and would use them even when they changed since the page opened.
- **Count every initiative of the meeting, also deleted ones**, as the literal text of the ticket for existing data says. A meeting that covers one deleted and one live initiative would then give its tasks no initiative in the migration, but the live one in `create_meeting_task`. One rule for both is easier to explain.
- **Add the columns with `ALTER TABLE ... ADD COLUMN`**, without a rebuild. It works for all six columns, but it cannot add the check constraint, and the columns would follow `completed_at` in the definition of the table.
