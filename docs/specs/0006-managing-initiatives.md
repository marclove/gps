# Spec 0006: Manage initiatives on a roadmap

Ticket: [0006 Managing initiatives](../features/0006-managing-initiatives.md)

Executable specs: `src/features/initiatives/roadmap.spec.tsx`, `src/features/initiatives/initiative-sheet.spec.tsx`, `src/features/initiatives/roadmap.browser.spec.tsx`, and `src/features/meetings/meeting-initiative.spec.tsx`

## Summary

The user records the company initiatives that they have a responsibility in, with a name, a description, and their role in each one. The initiatives are cards on a roadmap with the columns Now, Next, Later, and Done. The user sets the priority of the initiatives by dragging the cards between the columns and inside a column, with the pointer or the keyboard. Dragging a card to Done completes the initiative, and dragging it out of Done reopens it. Clicking a card opens a sheet in which the user edits the initiative. Changes are saved automatically. The user can delete an initiative and undo the delete. On the editor page of a meeting, the user assigns the meeting to an initiative.

See [ADR 0013](../adrs/0013-store-initiatives-on-a-roadmap.md) for how initiatives and their order are stored, [ADR 0014](../adrs/0014-drag-cards-with-dnd-kit.md) for dragging, [ADR 0015](../adrs/0015-edit-initiatives-in-a-sheet.md) for the sheet, and [ADR 0016](../adrs/0016-share-editor-parts-between-meetings-and-initiatives.md) for the parts that initiatives share with meetings.

## Terms

- **Initiative**: a larger piece of company work that the user has a responsibility in, such as a product launch. It has a name, a description, and a role.
- **Role**: the user's responsibility in an initiative, in the RACI model. It is one of "Responsible", "Accountable", "Consulted", and "Informed", or no role.
- **Roadmap**: the board on the Initiatives page. It has four columns, from left to right: Now, Next, Later, and Done.
- **Card**: an initiative on the roadmap.
- **Complete**: to move an initiative to Done. **Reopen**: to move it from Done to another column.
- **Sheet**: the panel at the right side of the window in which the user edits one initiative. It is a modal dialog.
- **Delete**: to remove an initiative from the roadmap. The initiative is kept, and "Undo" in the toast brings it back.
- **Same name**: two names are the same when they are equal after removing spaces at the start and the end, without regard to uppercase and lowercase letters. For example, "Launch", "launch", and " Launch " are the same name.
- **Assign**: to record that a meeting is about an initiative. A meeting is assigned to at most one initiative.

The terms "meeting", "Meetings page", and "editor page" are defined in [Spec 0001](0001-take-meeting-notes.md). The terms "archive", "restore", and "archive toast" are defined in [Spec 0004](0004-archive-meeting-notes.md). The terms "meeting details sidebar" and "failure toast" are defined in [Spec 0005](0005-meeting-action-items.md). For initiatives, the archive toast is called the delete toast.

## Behavior

### Section

- The sidebar of the application has a link named "Initiatives", below the link named "Meetings". It shows a target icon, and its tooltip says "Initiatives".
- The link opens the Initiatives page. While the Initiatives page is open, the "Initiatives" link is marked as the current page.
- The application still opens on the Meetings page.

### Roadmap

- The page header shows the breadcrumb "Initiatives" and a button named "New initiative".
- Below the header, the roadmap fills the rest of the main area. It has four columns of equal width, from left to right: Now, Next, Later, and Done. Each column is a region named after the column, such as "Now", with a heading that shows the name and the number of cards in the column, such as "Next 3".
- Now, Next, and Later show their cards in the order that the user set, from the top. Done shows its cards in the order of completion, the initiative completed last at the top.
- The roadmap shows every initiative that is not deleted.
- A column with no cards says "No initiatives".
- Each card shows the name of the initiative, or "Untitled initiative" when the name is empty. When the initiative has a role, the card also shows the role, such as "Accountable". A card in Done also shows a check mark, and its text is muted.
- Each card is a button whose accessible name starts with the name of the initiative. Clicking it, or pressing Enter while it has keyboard focus, opens its sheet.
- While the initiatives load, the columns show their headings and no cards. If they cannot be loaded, the roadmap is replaced by the text "Couldn't load initiatives" and a "Retry" button that loads them again.
- When a column has more cards than fit in the window, only that column's list of cards scrolls. The page header and the headings of the columns stay in place, and the window does not scroll.

### Dragging cards with the pointer

- The user drags a card by pressing the pointer on it and moving it. A drag starts only after the pointer moves 8 pixels, so a click opens the sheet and does not move the card.
- While a card is dragged, the other cards make room for it at the place where it would drop.
- A card dropped in Now, Next, or Later goes to the place where it was dropped, in the same column or another one, including an empty column. The order of the other cards does not change.
- A card dropped in Done, from any column, completes the initiative. It appears at the top of Done, wherever in Done it was dropped. Dragging a card inside Done does not change the order of Done.
- A card dragged from Done to Now, Next, or Later reopens the initiative. It goes to the place where it was dropped, and it no longer shows the check mark.
- The new place of a card is kept when the user leaves the page and opens it again, and after the application is closed and opened again.
- If the new place cannot be saved, the card goes back to the place it had before the drag, and a failure toast says "Couldn't move the initiative. Try again."

### Dragging cards with the keyboard

- When a card has keyboard focus, pressing Space picks it up.
- While a card is picked up, the Up and Down arrow keys move it one place in its column, and the Left and Right arrow keys move it to the column at that side. Pressing Space drops it, with the same results as a drop with the pointer. Pressing Escape puts it back where it was.
- Screen readers announce each step:
  - `Picked up <name>.` when the card is picked up,
  - `<name> is in <column>, position <n> of <count>.` after each move,
  - `<name> was moved to <column>, position <n> of <count>.` after a drop in Now, Next, or Later,
  - `<name> was completed.` after a drop in Done,
  - `<name> was put back.` after Escape.

  `<name>` is the name of the initiative, or "Untitled initiative". Positions count from 1.
- After a drop, keyboard focus stays on the card in its new place.

### Creating an initiative

- When the user clicks "New initiative", a new initiative is created at the top of Later, and its sheet opens. The new initiative has an empty name, an empty description, and no role.
- The "Initiative name" field has keyboard focus.
- While the initiative is being created, the "New initiative" button is disabled.
- If the initiative cannot be created, no sheet opens, the button is enabled again, and a failure toast says "Couldn't create the initiative. Try again."

### The sheet

- The sheet opens from the right side of the window and is as tall as the window. The roadmap stays visible at its left, dimmed. The sheet is a dialog whose accessible name is the name of the initiative, or "Untitled initiative" when the name is empty.
- From top to bottom, the sheet shows:
  1. a text field named "Initiative name", the save status, and a button named "Close". When the name is empty, the field shows "Untitled initiative" as a placeholder.
  2. a select box named "RACI role", with a visible label "Role",
  3. for a completed initiative only, the text `Completed on <date>`, such as "Completed on September 26, 2026", in the user's local time zone,
  4. the formatting toolbar and the description, in an editor named "Description", with the same formatting as the notes of a meeting,
  5. a button named "Delete".
- The "RACI role" select box has these choices, in this order: an empty choice, which means no role, then "Responsible", "Accountable", "Consulted", and "Informed". For an initiative with no role, the empty choice is selected.
- When the description is taller than the space it has, only the description scrolls. The name, the role, the toolbar, and the "Delete" button stay in place.
- The "Close" button, the Escape key, and a click on the dimmed roadmap close the sheet. Keyboard focus then goes back to the card of the initiative.
- While the initiative loads, the fields are disabled. If it cannot be loaded, the sheet says "Couldn't load the initiative" and shows a "Retry" button.

### Saving

- Changes to the name, the description, and the role are saved automatically after the user pauses for about half a second. The save status shows "Saving…", "Saved", or "Couldn't save" with a "Retry" button, as on the editor page of a meeting.
- If the user closes the sheet before the pause ends, the change is saved at once.
- After a change is saved, the card on the roadmap shows the new name and role. The card stays in its place.
- The name, the description, and the role are kept when the user closes the sheet and opens it again, and after the application is closed and opened again.
- A name is saved without the spaces at its start and end. The card and the title of the sheet show the saved name. The name field keeps the text as the user typed it.

### Unique names

- Two initiatives that are not deleted cannot have the same name. Completed initiatives count. Deleted initiatives do not, so the name of a deleted initiative can be used again. Any number of initiatives can have an empty name.
- When the user types a name that another initiative has, and pauses, the name is not saved. The name field is marked as invalid, and a message below it says `Another initiative is named "<name>".`, with the name as the user typed it without the spaces at its start and end. The field describes itself with this message for screen readers.
- The card and the title of the sheet keep the name that was saved last.
- The role and the description are still saved, and the save status does not say "Couldn't save".
- The message goes away when the user changes the name and it is saved.
- If the user closes the sheet while the message is shown, the name that the user typed is not saved, and the card keeps the name that was saved last.

### Deleting an initiative

- When the user clicks "Delete" in the sheet, a change that was not yet saved is saved, the initiative is deleted, the sheet closes, and the card is removed from the roadmap. The other cards keep their order. There is no confirmation dialog, because the delete can be undone.
- Keyboard focus moves to the "New initiative" button.
- The delete toast says `Deleted "<name>".` and has an "Undo" button and a "Close" button. It behaves like the archive toast of [Spec 0004](0004-archive-meeting-notes.md).
- When the user clicks "Undo", the initiative is restored to the column and the place it had. If that column now has fewer cards than the old place, the card goes to the end of the column. A completed initiative goes back to Done. If the Initiatives page is open, keyboard focus moves to the restored card.
- If the initiative cannot be deleted, the sheet stays open and a failure toast says "Couldn't delete the initiative. Try again."
- If the initiative cannot be restored, the text of the delete toast changes to "Couldn't restore the initiative. Try again.", and its "Undo" button tries again.
- If another initiative that is not deleted has the same name when the user clicks "Undo", the initiative stays deleted. The text of the delete toast changes to `Couldn't restore "<name>" because another initiative has that name.`, and the toast has no "Undo" button.
- There is only one archive toast, for meetings and initiatives together. When the user deletes an initiative while the archive toast for a meeting is open, that toast closes and the delete toast appears, and the other way around.
- A deleted initiative does not appear on the roadmap. Deleting it does not change its name, description, or role, and it does not change the meetings that are assigned to it.

### Assigning a meeting to an initiative

- The meeting details sidebar has a row with the label "Initiative" and a select box named "Meeting initiative", below the "Date" row and above the "Archive" button.
- The select box has an empty choice first, which means that the meeting is not assigned. Then it has groups of choices, in this order, each with the name of the group as its label:
  1. "Now", "Next", and "Later", with the initiatives in each column in the order of the roadmap,
  2. "Completed", with the completed initiatives that are not deleted,
  3. "Deleted", with the deleted initiatives.

  The initiatives in "Completed" and "Deleted" are in alphabetical order of their names, without regard to uppercase and lowercase letters. A group with no initiatives is left out. Each choice shows the name of the initiative, or "Untitled initiative" when the name is empty.
- The choice that is selected is the initiative that the meeting is assigned to, or the empty choice if it is not assigned.
- When the user chooses an initiative, the assignment is saved at once. When the user chooses the empty choice, the assignment is removed. The save status of the editor page does not change.
- If the assignment cannot be saved, the select box shows the choice that was saved last again, and a failure toast says "Couldn't assign the initiative. Try again." When a later assignment succeeds, the failure toast closes.
- While the initiatives load, the select box is disabled. If they cannot be loaded, the row says "Couldn't load initiatives" and shows a "Retry" button that loads them again. The rest of the editor page works as usual.
- The assignment is kept when the user leaves the editor page and opens it again, and after the application is closed and opened again.

## Changes to earlier specs

Merged specs are not changed. This spec changes them as follows:

- [Spec 0003](0003-compact-section-nav.md): the sidebar of the application has two sections, Meetings and Initiatives.
- [Spec 0005](0005-meeting-action-items.md): the meeting details sidebar shows, from top to bottom, the "Date" row, the "Initiative" row, the "Archive" button, a separator, and the action items panel.

## Not checked by the executable specs

- That the delete toast closes by itself after 8 seconds, and the pauses of that time. The archive toast of Spec 0004 is checked by hand in the same way.
- That the other cards make room while a card is dragged with the pointer. The executable specs check only where the card ends up.
- The look of the dimmed roadmap behind the sheet.

Check these by hand with `bun run tauri dev`.

## Backend contract

The executable specs replace the Tauri backend with an in-memory fake. They rely on the commands of the earlier specs, with these changes and additions, which the real backend must provide. Arguments and results use camelCase names.

| Command                  | Arguments                                   | Result                                      |
| ------------------------ | ------------------------------------------- | ------------------------------------------- |
| `list_initiatives`       | `includeArchived`                           | list of initiative summaries                |
| `create_initiative`      | none                                        | the new initiative                          |
| `get_initiative`         | `id`                                        | the initiative, or `null` if none has the id |
| `rename_initiative`      | `id`, `name`                                | `{ status: "renamed", initiative }` or `{ status: "nameTaken" }` |
| `update_initiative`      | `id`, `description`, `raciRole`             | the initiative                              |
| `move_initiative`        | `id`, `destination`, `index`                | nothing (`null`)                            |
| `archive_initiative`     | `id`                                        | nothing (`null`)                            |
| `unarchive_initiative`   | `id`                                        | `{ status: "restored" }` or `{ status: "nameTaken" }` |
| `set_meeting_initiative` | `id`, `initiativeId`                        | the meeting                                 |

- An initiative has `id`, `name`, `description`, `raciRole`, `horizon`, `position`, `createdAt`, `updatedAt`, `completedAt`, and `archivedAt`. A summary has the same fields without `description`.
- `raciRole` is `"responsible"`, `"accountable"`, `"consulted"`, `"informed"`, or `null`. `horizon` is `"now"`, `"next"`, or `"later"`. `completedAt` and `archivedAt` are RFC 3339 timestamps or `null`.
- `list_initiatives` returns the initiatives that are not deleted, or all of them when `includeArchived` is `true`, in any order. The frontend sorts them.
- `create_initiative` puts the new initiative at position 0 of Later, and moves the other initiatives in Later down by one.
- `rename_initiative` removes the spaces at the start and the end of the name. If another initiative that is not deleted has the same name, and the name is not empty, it returns `nameTaken` and changes nothing. Otherwise, it saves the name, changes `updatedAt`, and returns the initiative.
- `update_initiative` changes only the description, the role, and `updatedAt`.
- `move_initiative` takes `destination` `"now"`, `"next"`, `"later"`, or `"done"`, and `index`, the place from 0 at which the card was dropped. It keeps the positions of each column as 0, 1, 2, and so on, as [ADR 0013](../adrs/0013-store-initiatives-on-a-roadmap.md) describes. For `"done"`, it sets `completedAt` and ignores `index`. From Done to another column, it clears `completedAt`.
- `archive_initiative` and `unarchive_initiative` delete and restore an initiative, and keep the positions as ADR 0013 describes. `unarchive_initiative` returns `nameTaken` and changes nothing when another initiative that is not deleted has the same name.
- A meeting has a new field, `initiativeId`, which is the identifier of an initiative or `null`. `set_meeting_initiative` accepts any initiative, also a completed or deleted one, or `null`.
- Every command rejects with a message when no item has the identifier, a value is not allowed, or the database reports an error. `move_initiative` also rejects a deleted initiative.

## Out of scope

- A page or filter that shows deleted initiatives, and restoring an initiative after the delete toast has closed.
- Deleting initiatives permanently.
- Showing the meetings of an initiative.
- Buttons in the sheet to complete or reopen an initiative. Dragging does this.
- Changing the order of Done.
