# 21. Store the initiatives of a meeting in a link table

Date: 2026-09-28

## Status

Accepted

Supersedes the parts of ADR 0019 that are about the initiative of a meeting: the column `meetings.initiative_id`, the command `set_meeting_initiative`, and what happens to meetings when an initiative moves to another project.

## Context

Feature ticket 0009 lets a meeting cover several initiatives. For example, a weekly sync of a project can review the launch, the migration, and the pilot of that project. The user wants to record every initiative that the meeting covered, not only one.

Today each row of the table `meetings` has one optional `initiative_id` (ADR 0013), and a meeting is about one project or about no project (ADR 0019). The backend keeps the rule that the initiative of a meeting belongs to the project of the meeting:

- `set_meeting_initiative` sets the initiative and also sets the project of the meeting to the project of that initiative.
- `set_meeting_project` clears the initiative when the project changes.
- `set_initiative_project`, which moves an initiative to another project, moves every meeting that is assigned to the initiative to that project too.

ADR 0019 left open what a move does when a meeting also covers other initiatives. `docs/target-data-model.md` already describes a table `meeting_initiatives` for the new model, and the ticket gives a draft of it.

The ticket asks for these rules:

- A meeting covers any number of initiatives, including none. They are initiatives of the meeting's project.
- The user interface offers the initiatives of the meeting's project, including completed ones, but not deleted ones. An initiative that is deleted after the meeting covers it stays on the meeting.
- Changing the project of a meeting removes all of its initiatives.
- Choosing an initiative gives the meeting the project of that initiative.
- A meeting that covers one initiative before the update covers the same initiative after it, and keeps its project.
- Each change is saved at once.
- When an initiative moves to another project, a meeting that covers it moves with it only when it covers no other initiative. Otherwise the meeting stays in its project and stops covering the moved initiative.

We had to decide:

- how the tables change, and how the migration keeps the existing links,
- which commands the frontend uses to change the initiatives of a meeting,
- how the backend keeps the rule that the initiatives of a meeting belong to its project,
- which links count as "other initiatives" when an initiative moves.

## Decision

### Tables

A new table `meeting_initiatives` holds one row for each initiative that a meeting covers:

| Column          | Meaning                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| `meeting_id`    | Not null. Refers to `meetings.id`.                                                       |
| `initiative_id` | Not null. Refers to `initiatives.id`. The initiative belongs to the project of the meeting. |
| `created_at`    | Not null. The time when the meeting started to cover the initiative, as an RFC 3339 timestamp in UTC. |

The primary key is the pair `(meeting_id, initiative_id)`, so a meeting covers an initiative at most once. The primary key also makes it fast to find the initiatives of a meeting. A second index, `meeting_initiatives_initiative_id` on `initiative_id`, makes it fast to find the meetings of an initiative. The move of an initiative uses it now, and a later list of the meetings of an initiative can use it too.

A row is a link, not content that the user writes. So when the user removes an initiative from a meeting, the backend deletes the row. It has no `deleted_at`, unlike the tables of ADR 0017, and there is no "Undo". The user adds the initiative again to undo a removal.

The column `meetings.initiative_id` and its index `meetings_initiative_id` are removed.

### The migration

One new migration, added at the end of `MIGRATIONS` in `src-tauri/src/db.rs`:

1. Creates `meeting_initiatives` and its index.
2. For each meeting whose `initiative_id` is not null, inserts the row `(meeting id, initiative_id, updated_at of the meeting)`. The migration cannot know when the user chose the initiative, and `updated_at` is the latest time at which that can have happened. Deleted meetings and deleted initiatives are copied too, so that the history stays complete and a meeting that is restored later still has its initiative.
3. Rebuilds `meetings` without `initiative_id`, in the same way as ADR 0017 rebuilt `initiatives`: it creates `meetings_new`, copies every row with the same identifier, drops `meetings`, renames `meetings_new`, and creates the index `meetings_project_id` again. SQLite cannot drop a column that has a foreign key, so a rebuild is necessary.

The migration does not change `project_id`. ADR 0019 already gave each meeting with an initiative the project of that initiative, so each meeting keeps its project. As for every migration since ADR 0017, foreign keys are off while it runs, and it ends with a foreign key check. The identifiers of the meetings do not change, so `tasks.meeting_id` stays valid.

### Commands

`set_meeting_initiative` is removed. Two new commands replace it:

| Command                     | Arguments            | Result      |
| --------------------------- | -------------------- | ----------- |
| `add_meeting_initiative`    | `id`, `initiativeId` | the meeting |
| `remove_meeting_initiative` | `id`, `initiativeId` | the meeting |

A meeting has `initiativeIds` in place of `initiativeId`. It is a list of the identifiers of the initiatives that the meeting covers, in ascending order, also the deleted ones. The frontend sorts them for display. The summary of a meeting in `list_meetings` does not change.

We chose one command for each change, rather than one command that replaces the whole list, because the user checks and unchecks initiatives one at a time, and each change is saved at once. When the user checks two initiatives quickly, two commands that each replace the list could arrive in an order that loses the first change. An add and a remove each change one row, so their order does not matter.

- `add_meeting_initiative`:
  - Refuses an initiative that is deleted or does not exist, and refuses a meeting that does not exist. The user interface does not offer deleted initiatives.
  - Does nothing if the meeting already covers the initiative. Nothing changes, not even `updated_at`.
  - If the initiative belongs to the project of the meeting, inserts the row with the current time as `created_at`, and changes `updated_at` of the meeting.
  - If the initiative belongs to another project, or the meeting has no project, the answer depends on the other initiatives of the meeting:
    - If the meeting covers no initiative, the command sets the project of the meeting to the project of the initiative, inserts the row, and changes `updated_at`. This keeps the rule of ADR 0019 that choosing an initiative gives the meeting the project of that initiative.
    - If the meeting covers any initiative, also a deleted one, the command refuses the change and changes nothing. The frontend shows the failure as for any other refused change.

    This is the same rule as for a move of an initiative, below: a meeting follows an initiative to its project only when it covers no other initiative. The user interface offers only initiatives of the meeting's project, and disables the choice for a meeting without a project, so these cases happen only when the frontend is out of date, or for another caller of the command.
- `remove_meeting_initiative`:
  - Deletes the row and changes `updated_at` of the meeting.
  - Does nothing if the meeting does not cover the initiative.
  - Works for a deleted initiative too, so that the user can remove an initiative that was deleted after the meeting covered it.
  - Does not change the project of the meeting, even when the meeting then covers no initiative.

Each command runs in one transaction.

### The project of a meeting

`set_meeting_project` removes every row of the meeting from `meeting_initiatives` when the project changes, because those initiatives belong to the old project. The rest of the command stays as ADR 0019 describes: setting the project that the meeting already has changes nothing, and a deleted project is refused.

### Moving an initiative to another project

`set_initiative_project` keeps its arguments, its answers, and its checks (ADR 0019). For each meeting that covers the moved initiative, in the same transaction as the move:

- If the meeting covers no other initiative, the meeting moves to the new project with the initiative, and keeps the link. The meeting's `updated_at` changes.
- If the meeting covers another initiative, the meeting stays in its project, and the backend deletes the row of the moved initiative. The meeting's `updated_at` changes.

"Another initiative" is any other row of the meeting in `meeting_initiatives`, also the row of a deleted or a completed initiative. A deleted initiative is still part of what the meeting covered in its project, so the meeting keeps that project.

This keeps the rule that every initiative of a meeting belongs to the project of the meeting. A meeting that is only about the moved initiative follows it, as ADR 0019 decided for the single initiative. A meeting that is also about other initiatives stays with them, because moving it would break their links.

## Consequences

- The data model of meetings matches `docs/target-data-model.md`. `docs/data-model.md` shows the new table, and no longer shows `meetings.initiative_id`.
- Existing meetings keep their initiative and their project after the update.
- A move of an initiative can remove it from a meeting. The user can see the change on the meeting, but no message tells them about it.
- The rule that the initiatives of a meeting belong to its project lives in the backend, in `add_meeting_initiative`, `set_meeting_project`, and `set_initiative_project`. A new command that changes these rows must keep the rule too. The unit tests of these functions in `src-tauri/src/meetings.rs` and `src-tauri/src/initiatives.rs` check it.
- A removal cannot be undone with a toast. The user adds the initiative again, unless it was deleted in the meantime.
- `get_meeting` reads the initiatives of a meeting with a second query. This is fast because of the primary key.
- No page shows the meetings of an initiative yet. The index on `initiative_id` makes such a list fast when a later ticket adds it.

## Alternatives considered

- **One command that replaces the whole list**, `set_meeting_initiatives(id, initiativeIds)`. It is simpler for the backend, but two quick changes can arrive in the wrong order, and a change that is based on an out of date list removes initiatives that another change added.
- **A `deleted_at` column on `meeting_initiatives`**, so that a removal could be undone like a delete. A link has no content to lose, adding it again is one click, and the ticket asks for the row to be removed.
- **Adding an initiative of another project always moves the meeting** to that project and removes the other initiatives of the meeting, as `set_meeting_initiative` replaced the single initiative. The meeting would always be consistent, but it would lose links that the user did not touch, without a message and without "Undo", in a case that happens only by accident.
- **Always refuse an initiative of another project.** This is the simplest rule, but it drops the rule of the ticket that choosing an initiative gives the meeting the project of that initiative.
- **A move of an initiative always moves its meetings**, as in ADR 0019. The other initiatives of a meeting would then belong to another project than the meeting. The ticket rejects this.
- **A move of an initiative never moves its meetings.** Every meeting of the initiative would lose the link, also the ones that are only about it. ADR 0019 chose to move them, and the ticket keeps that when the meeting covers nothing else.
- **Count only initiatives that are not deleted as "other initiatives"** when an initiative moves. A meeting that covers the moved initiative and a deleted one would move to the new project, and the link to the deleted initiative would then point to another project than the meeting's. If the user restored that initiative, the rule would be broken.
- **Keep `meetings.initiative_id` as the "main" initiative**, next to the new table. The ticket says that the user should not have to choose the one initiative that a meeting was "most" about.
