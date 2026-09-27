# 13. Store initiatives on a roadmap with an order in each column

Date: 2026-09-26

## Status

Accepted

## Context

Feature ticket 0006 asks for a way to record the company initiatives that the user has a responsibility in, and to see how they are sequenced. An initiative is a larger piece of company work, such as a product launch or a migration. For each initiative, the user records a name, a description, and their role in it.

The user's role follows the RACI model, which companies use to say who does what in a project. RACI has four roles:

- **Responsible**: the person who does the work.
- **Accountable**: the person who answers for the result and approves it.
- **Consulted**: a person whose opinion is asked before a decision.
- **Informed**: a person who is told about the progress and the decisions.

The initiatives are shown on a roadmap. A roadmap of this kind has three columns, called horizons:

- **Now**: the work the user is doing at the moment.
- **Next**: the work that comes after that.
- **Later**: the work that is planned but not close.

The board has a fourth column, **Done**, for completed initiatives. The user moves an initiative by dragging its card to another column or to another place in the same column. The order of the cards in Now, Next, and Later is a priority that the user sets. Done is always ordered by the time of completion, newest first.

An initiative leaves the board in one of two ways. It can be completed, which moves it to Done. It can also be deleted, which removes it from the board. The user interface says "Delete", but the data is kept, as for archived meetings (ADR 0008), so that an "Undo" button in a toast can bring the initiative back and so that meetings assigned to it keep their link.

Each meeting can be assigned to one initiative, so that later the user can see how their work contributed to it. The user chooses the initiative by its name in a select box, so two initiatives must not have the same name. The user asked for the database to enforce this, so that no code path can store a second initiative with a name that is already used.

The Rust backend owns the SQLite database (ADR 0003), and the frontend changes data only through named backend commands.

We had to decide:

- how the database stores initiatives, their columns, and their order,
- how the database keeps the names of initiatives different from each other,
- how the order stays correct when cards move, are completed, are deleted, and are restored,
- which commands the frontend uses,
- how a meeting refers to an initiative.

## Decision

### Table

A new migration creates the table `initiatives`:

| Column         | Type                                | Meaning                                                                                                       |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`           | `INTEGER` primary key               | The identifier that SQLite assigns.                                                                           |
| `name`         | `TEXT NOT NULL`, default `''`       | The name, without spaces at the start or the end. A new initiative has an empty name, and the user interface shows "Untitled initiative" for it. |
| `description`  | `TEXT NOT NULL`, default `''`       | The description, as Markdown (ADR 0004).                                                                      |
| `raci_role`    | `TEXT`, may be `NULL`               | The user's role: `responsible`, `accountable`, `consulted`, or `informed`. `NULL` until the user chooses one.  |
| `horizon`      | `TEXT NOT NULL`, default `'later'`  | The column: `now`, `next`, or `later`. For a completed or deleted initiative, the column it was in last.       |
| `position`     | `INTEGER NOT NULL`                  | The place in the column, from 0 at the top. For a completed or deleted initiative, the place it had last.      |
| `created_at`   | `TEXT NOT NULL`                     | When the initiative was created, as an RFC 3339 timestamp in UTC.                                             |
| `updated_at`   | `TEXT NOT NULL`                     | When the name, the description, or the role last changed, as an RFC 3339 timestamp in UTC.                    |
| `archived_at`  | `TEXT`, may be `NULL`               | `NULL` unless the initiative is deleted. Otherwise, when it was deleted, as an RFC 3339 timestamp in UTC.     |
| `completed_at` | `TEXT`, may be `NULL`               | `NULL` unless the initiative is completed. Otherwise, when it was completed, as an RFC 3339 timestamp in UTC.  |

- `CHECK` constraints accept only the values listed for `raci_role` and `horizon`, in lowercase. The backend also checks each value before it writes it, so that the frontend gets a clear message instead of a constraint error.
- The column is named `archived_at` and the backend commands say "archive", as for meetings. Only the text that the user sees says "Delete". This keeps one word for the same kind of data in the code.
- Done is not a value of `horizon`. An initiative is in Done when `completed_at` is set. Keeping `horizon` and `position` for a completed initiative records where it was, and lets the database keep `horizon` `NOT NULL`, as the ticket asks.
- An index on `(horizon, position)` makes it fast to read a column in order.

### Unique names

A unique index keeps the names different:

```sql
CREATE UNIQUE INDEX initiatives_name ON initiatives(name COLLATE NOCASE)
    WHERE archived_at IS NULL AND name <> '';
```

- **Only initiatives that are not deleted count.** A deleted initiative gives its name free, so the user can use the name again. The application has no view of deleted initiatives, so a name that a hidden initiative keeps would be an error that the user cannot understand or fix. Completed initiatives count, because they are visible in Done.
- **Uppercase and lowercase letters do not count.** "Launch" and "launch" are the same name. `COLLATE NOCASE` in SQLite folds only the letters A to Z, so "É" and "é" are different names. This is enough for the names that the user types, and it needs no extension of SQLite.
- **Spaces at the start and the end do not count.** The backend removes them before it writes a name, so " Launch " is stored as "Launch".
- **Empty names do not count.** Any number of initiatives can have an empty name. A new initiative starts with an empty name, and the user names it in the sheet.
- The backend checks for a conflict before it writes, so that it can report the conflict as a result and not as an error. The index is the guard for every other path, such as a restore or a later feature that writes names.

The same migration adds a column to `meetings`:

| Column          | Type                     | Meaning                                                                         |
| --------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `initiative_id` | `INTEGER`, may be `NULL` | The initiative that the meeting is assigned to. It refers to `initiatives(id)`. |

- An index on `initiative_id` makes it fast to find the meetings of an initiative later.
- The database enforces foreign keys (ADR 0010), so `initiative_id` must refer to an initiative that exists. The application never removes a row from `initiatives`, so the reference has no `ON DELETE` action.

### The order of the cards

An initiative is **on the board** when it is neither completed nor deleted. The rule is: in each of Now, Next, and Later, the initiatives on the board have the positions 0, 1, 2, and so on, with no gap and no repeated number. Every change keeps this rule, inside one transaction:

- **Create**: every initiative on the board in Later moves down by one, and the new initiative gets position 0 in Later. New work is at the top of Later, where the user sees it.
- **Move** to Now, Next, or Later at a given index: the initiatives after the card in its old column move up by one, which closes the gap. The initiatives at or after the index in the new column move down by one, which opens a place. The card takes that place. An index larger than the column puts the card at the end. A move inside one column works the same way.
- **Complete** (a move to Done): the gap in the old column closes. The card keeps its `horizon` and `position`, and `completed_at` is set. The index is ignored, because Done is ordered by `completed_at`.
- **Reopen** (a move from Done to Now, Next, or Later): `completed_at` is cleared, and the card is placed at the index as for a move.
- **Delete**: the gap in the column closes. The card keeps its `horizon` and `position`, and `archived_at` is set. A completed initiative is not on the board, so deleting it closes no gap.
- **Restore** (the "Undo" button after a delete): `archived_at` is cleared. An initiative that is not completed is placed back in its old column at its old position, as for a move, so it appears where it was. If the column is now shorter, it goes at the end. A completed initiative goes back to Done. If another initiative that is not deleted now has the same name, the restore does not happen, and the initiative stays deleted.

We store dense positions and renumber the affected rows on each change. There are only dozens of initiatives, so a change writes a few rows. The numbers are the same as the places that the user sees, which makes them easy to test and to read in the database.

There is no unique index on `(horizon, position)`. SQLite checks a unique index row by row during an `UPDATE`, so shifting a column by one would fail halfway unless every change went through temporary values. Instead, the functions in `src-tauri/src/initiatives.rs` keep the rule, and their unit tests check it after every kind of change.

### Commands

| Command                  | Arguments                                                 | Result                            |
| ------------------------ | --------------------------------------------------------- | --------------------------------- |
| `list_initiatives`       | `includeArchived`                                         | summaries of the initiatives      |
| `create_initiative`      | none                                                      | the new initiative                |
| `get_initiative`         | `id`                                                      | the initiative, or nothing        |
| `rename_initiative`      | `id`, `name`                                              | `{ status: "renamed", initiative }` or `{ status: "nameTaken" }` |
| `update_initiative`      | `id`, `description`, `raciRole`                           | the initiative                    |
| `move_initiative`        | `id`, `destination` (`now`, `next`, `later`, or `done`), `index` | nothing                    |
| `archive_initiative`     | `id`                                                      | nothing                           |
| `unarchive_initiative`   | `id`                                                      | `{ status: "restored" }` or `{ status: "nameTaken" }` |
| `set_meeting_initiative` | `id` of the meeting, `initiativeId` or `null`             | the meeting                       |

- A summary has the identifier, the name, the role, the horizon, the position, and the times of the creation, the last change, the completion, and the deletion. It has no description, because the board does not show it.
- The board asks for the initiatives that are not deleted. The select box of the meeting sidebar asks for all of them, so that a meeting assigned to a deleted initiative still shows that initiative as its choice. The select box does not offer other deleted initiatives.
- A name that another initiative already has is an expected result, not an error. `rename_initiative` and `unarchive_initiative` return `nameTaken` and change nothing, so the frontend can tell the user what happened without reading the text of an error. Other failures still reject with a message, as for every command. `rename_initiative` removes spaces at the start and the end of the name before it compares and writes it.
- The name has its own command so that a name conflict never stops the description and the role from being saved. `update_initiative` changes only the description and the role.
- `update_initiative` does not change the column, the position, or the timestamps other than `updated_at`. Only `move_initiative` changes the column and the order. This keeps the automatic saving of the text separate from dragging, so a slow save cannot undo a drag.
- `move_initiative` rejects a deleted initiative. All commands reject an unknown identifier and a value outside the allowed values.
- `set_meeting_initiative` accepts a deleted or completed initiative. It saves only the link, and changes the meeting's `updated_at`, as a change of its date does.
- `get_meeting` returns `initiativeId` as part of the meeting.
- `src/lib/initiatives.ts` holds the TypeScript types and the only `invoke` calls for initiatives, as `src/lib/meetings.ts` does for meetings.

## Consequences

- Two initiatives on the roadmap never have the same name, so the select box of a meeting never shows two choices that look the same, except that the deleted initiative that a meeting is assigned to can have the name of one that is not deleted. The deleted one is then the last choice, outside the groups.
- "Undo" after a delete can fail because of a name. This happens only if the user gives another initiative the same name in the few seconds while the toast is open.

- One command, `move_initiative`, covers every drag on the board: in a column, between columns, to Done, and out of Done. The frontend never computes positions. It sends the column and the index where the card was dropped.
- The row of a completed or deleted initiative keeps a position that no longer matches a place on the board. Code must read `position` only for initiatives on the board, except when it restores a deleted one.
- Without a unique index, a bug in `initiatives.rs` could give two cards the same position. The board would still show both, sorted by position and then by identifier, and the next move would renumber the column. The unit tests are the guard against this.
- A later feature, such as a yearly review, can list completed initiatives by `completed_at` and the meetings of each one by `initiative_id`.

## Alternatives considered

- **A unique name for every initiative, deleted or not** (a plain `UNIQUE` constraint). A restore could never conflict, but a name would stay used forever by an initiative that the user cannot see.
- **Unique names that differ in case**, such as "Launch" and "launch". Two initiatives that look almost the same would be allowed, which is what the rule is meant to prevent.
- **A name for every new initiative**, such as "Untitled initiative 2". Empty names that do not count are simpler, and the user interface already shows "Untitled initiative" for them.
- **One command that saves the name, the description, and the role together.** A name conflict would then stop the description from being saved until the user fixed the name.

- **Positions with gaps**, such as 1000, 2000, 3000, where a move takes the number between its neighbors. Most moves write one row, but the gaps run out, so the code needs a second path that renumbers a column. At this size, renumbering every time is simpler and has one path.
- **Fractional keys**, texts that sort between any two others. They never need renumbering, which matters when several devices change the same list at once. This application has one user and one database, and the keys cannot be read by a person.
- **`done` as a fourth value of `horizon`.** This would make Done one more column in the same rule. But Done is ordered by time and not by the user, and a reopened initiative would lose the record of where it was. The ticket also keeps completion as its own timestamp.
- **Delete rows for real.** Undo would then need to recreate the row with the same identifier, and meetings that refer to the initiative would lose their link.
