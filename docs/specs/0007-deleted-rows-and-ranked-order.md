# Spec 0007: Deleted rows and ranked order

Ticket: [0007 Deleted rows and ranked order](../features/0007-deleted-rows-and-ranked-order.md)

Executable specs: `src/features/meetings/delete.spec.tsx`, `src/features/meetings/delete.browser.spec.tsx`, `src/features/initiatives/roadmap.spec.tsx`, `src/features/initiatives/initiative-sheet.spec.tsx`, `src/features/meetings/meeting-initiative.spec.tsx`, `src/features/tasks/action-items.spec.tsx`, and `src/features/tasks/action-items.browser.spec.tsx`. Earlier specs checked the behavior of Specs 0004, 0005, and 0006 with the old words and command names. They now check the same behavior with the words and names of this spec.

## Summary

The application uses one word for removing a meeting or an initiative: "Delete". A deleted item is kept in the database, and "Undo" in the toast restores it, as before. The order of the cards on the roadmap is stored as a rank, a text key, instead of a number, so that moving a card changes only that card. The user sees the same items in the same order as before.

See [ADR 0017](../adrs/0017-mark-deleted-rows-and-order-cards-by-rank.md) for the names, the ranks, and the migration.

## Terms

- **Delete**: to remove a meeting or an initiative from every list without destroying it. It replaces the term "archive" of [Spec 0004](0004-archive-meeting-notes.md).
- **Restore**: to bring a deleted item back, with "Undo" in the delete toast.
- **Delete toast**: the toast that appears after a delete. It replaces the term "archive toast" of Spec 0004. There is one delete toast for meetings and initiatives together.
- **Rank**: the text that the backend stores for each initiative to record its place in its column. Ranks sort in the order of the cards, from the top.

The terms "meeting", "Meetings page", and "editor page" are defined in [Spec 0001](0001-take-meeting-notes.md). The terms "roadmap", "card", "complete", "reopen", and "sheet" are defined in [Spec 0006](0006-managing-initiatives.md).

## Behavior

### Deleting meetings

Everything that Spec 0004 describes for archiving meetings stays the same, with these words:

- Each meeting in the list of the Meetings page has a button with a trash can icon and the accessible name `Delete "<name>"`, such as `Delete "Weekly sync"`. It is visible, reached with the keyboard, and moves focus as the archive button of Spec 0004 did.
- The meeting details sidebar of the editor page has a button named "Delete", with a trash can icon, in the place of the "Archive" button.
- After a meeting is deleted, the delete toast says `Deleted "<name>".` and has an "Undo" button and a "Close" button.
- If a meeting cannot be deleted, the page says "Couldn't delete the meeting. Try again."
- If a meeting cannot be restored, the text of the delete toast changes to "Couldn't restore the meeting. Try again.", as before.

The application no longer shows the word "Archive" anywhere.

### Order of the roadmap

- Now, Next, and Later show their cards in the order of their ranks, from the top. The frontend compares ranks as text, character by character, by the codes of the characters, and not by the rules of a language. A rank is not a number: `81f` sorts before `c`, because `8` comes before `c`.
- Dragging cards with the pointer or the keyboard works as Spec 0006 describes. After a drop, the cards are in the order that the user sees during the drag.
- Done is still sorted by the time of completion, the initiative completed last at the top.
- The select box of a meeting's initiative lists the initiatives of Now, Next, and Later in the order of the roadmap, as before.
- After the update of the application, every column shows the same cards in the same order as before the update.

### Restoring an initiative

When the user clicks "Undo" in the delete toast of an initiative:

- A completed initiative goes back to Done, as before.
- An initiative that is not completed goes back to its column. It appears after every card that was above it when it was deleted and that has not been moved since, and before every card that was below it and has not been moved since.
- If a card was dropped into that column in the meantime and has taken the place of the deleted initiative, the restored card appears directly after that card.

This replaces the rule of Spec 0006 that a restored card goes back to its old place counted from the top, or to the end of a shorter column. The two rules give the same result when no card was moved while the initiative was deleted.

### Reopening an initiative

Dragging a card out of Done puts it where the user drops it, as before. The place that the initiative had before it was completed does not count.

## Changes to earlier specs

Merged specs are not changed. This spec changes them as follows:

- [Spec 0004](0004-archive-meeting-notes.md): every "Archive" in the user interface becomes "Delete", every "Archived" becomes "Deleted", and the failure text becomes "Couldn't delete the meeting. Try again." The archive toast is the delete toast. The backend contract changes as described below.
- [Spec 0005](0005-meeting-action-items.md) and [Spec 0006](0006-managing-initiatives.md): the meeting details sidebar shows, from top to bottom, the "Date" row, the "Initiative" row, the "Delete" button, a separator, and the action items panel. The select box of a meeting's initiative is above the "Delete" button.
- Spec 0006: a restored initiative goes back to its column as described in "Restoring an initiative" above. The backend contract changes as described below.

## Not checked by the executable specs

- That the order of every column is the same after the update of the application. The unit tests of the migration in `src-tauri/src/db.rs` check this against a database with positions.
- That a move writes only the moved initiative, and that the database rejects two initiatives on the board with the same rank in the same column. The unit tests in `src-tauri/src/initiatives.rs` check this.
- The ranks that the real backend generates. The executable specs use a fake backend with ranks of its own.

## Backend contract

The executable specs replace the Tauri backend with an in-memory fake. They rely on the commands of the earlier specs, with these changes, which the real backend must provide. Arguments and results use camelCase names.

| Before                 | After                | Arguments        | Result                                                |
| ---------------------- | -------------------- | ---------------- | ----------------------------------------------------- |
| `archive_meeting`      | `delete_meeting`     | `id`             | nothing (`null`)                                      |
| `unarchive_meeting`    | `restore_meeting`    | `id`             | nothing (`null`)                                      |
| `archive_initiative`   | `delete_initiative`  | `id`             | nothing (`null`)                                      |
| `unarchive_initiative` | `restore_initiative` | `id`             | `{ status: "restored" }` or `{ status: "nameTaken" }` |
| `list_initiatives`     | `list_initiatives`   | `includeDeleted` | list of initiative summaries                          |

- The commands behave as their old versions did, except for the order, described below. `list_meetings` leaves out deleted meetings. `get_meeting` and `update_meeting` work for deleted meetings.
- An initiative has `id`, `name`, `description`, `raciRole`, `horizon`, `rank`, `createdAt`, `updatedAt`, `completedAt`, and `deletedAt`. A summary has the same fields without `description`. It no longer has `position` or `archivedAt`.
- `rank` is a text of the characters `0` to `9` and `a` to `f`. In each of Now, Next, and Later, the initiatives on the board, which are neither completed nor deleted, have different ranks, and sorting them by rank as text gives their order from the top. A completed or deleted initiative keeps the rank that it had last.
- `list_initiatives` returns the initiatives that are not deleted, or all of them when `includeDeleted` is `true`, in any order. The frontend sorts them.
- `create_initiative` gives the new initiative a rank before every initiative on the board in Later.
- `move_initiative` takes `destination` and `index` as before. For Now, Next, and Later, it gives the initiative a rank between the ranks of the initiatives that will be before and after it, and changes no other initiative. For `"done"`, it sets `completedAt` and keeps the rank.
- `delete_initiative` sets `deletedAt` and keeps the rank.
- `restore_initiative` clears `deletedAt`. An initiative that is not completed keeps its rank if no initiative on the board in its column has the same rank. Otherwise, it gets a rank between that rank and the next rank in the column.

## Out of scope

- A page that shows deleted meetings or initiatives, and restoring an item after the delete toast has closed.
- Deleting rows permanently.
- Giving the ranks of a column new, shorter keys.
- Ranks for other tables, such as tasks.
