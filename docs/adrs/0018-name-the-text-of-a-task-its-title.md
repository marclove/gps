# 18. Name the text of a task its title

Date: 2026-09-28

## Status

Accepted

Supersedes the names of the column `description`, the command `update_task_description`, and the field `description` in [ADR 0010](0010-store-tasks-in-their-own-table.md).

## Context

A task is one piece of work that the user must do. In a meeting, the user interface calls a task an action item (ADR 0010). ADR 0010 stores the text of a task, such as "Send the deck", in a column named `description` of the table `tasks`. The backend command that changes this text is `update_task_description`, and the task that the commands return has a field named `description`.

The target data model (`docs/target-data-model.md`) describes the tables that the application is expected to grow into. In that model, a task has two texts:

- a **title**: one line that tells what to do, such as "Send the deck";
- **notes**: longer text in Markdown, which the user adds later to define the work.

In the target model, the one line of text is named `title`, and `notes` is a new column. In the rest of the database, `description` is the long Markdown text of an initiative. If the one line of a task stayed `description`, the same word would name a single line in one table and long Markdown in another, and a task would have a `description` and `notes` that are hard to tell apart.

The column `notes` is not part of this change. It comes with the feature that shows tasks outside meetings.

## Decision

The one line of text of a task is named `title` in every layer.

- A migration renames the column `description` of the table `tasks` to `title`, with `ALTER TABLE tasks RENAME COLUMN description TO title`. The data does not change.
- The backend command `update_task_description` is renamed to `update_task_title`. Its argument `description` is renamed to `title`.
- The argument `description` of the command `create_task` is renamed to `title`.
- The field `description` of a task, as the commands return it, is renamed to `title`.
- The frontend types and functions in `src/lib/tasks.ts` follow these names.

The user interface does not change. It shows the same text in the same places, and it does not show the word "title".

## Consequences

- The names in the database, the backend, and the frontend match the target data model, so the feature that adds notes to tasks does not also have to rename a column.
- The IPC contract between the frontend and the backend changes. The executable feature spec for action items (`src/features/tasks/action-items.spec.tsx`) mocks the backend with the names of the commands and fields, so its mock uses the new names. The behavior that the spec checks does not change.
- The written spec for action items (`docs/specs/0005-meeting-action-items.md`) lists the commands with the old names. That file is not changed after it is merged, so this ADR replaces those names: read `title` for `description` and `update_task_title` for `update_task_description`.
- A database that was created before this change gets the new column name the next time the application starts.
