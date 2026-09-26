# Spec 0005: Meeting action items

Ticket: [0005 Meeting action items](../features/0005-meeting-action-items.md)

Executable specs: `src/features/tasks/action-items.spec.tsx`, `src/features/tasks/action-items.browser.spec.tsx`, and the archive failure tests in `src/features/meetings/archive.spec.tsx`

## Summary

While writing the notes of a meeting, the user records the action items that they were given in that meeting. The action items are a checklist in the meeting details sidebar at the right side of the editor page. The sidebar also holds the meeting date and the Archive button (see [ADR 0011](../adrs/0011-show-meeting-details-in-a-sidebar.md)). The user can add items, change their text, check them off when the work is done, and remove them. The text of a checked item is grayed out. Action items are saved automatically and belong to their meeting. When an action on a meeting or an action item fails, a toast reports it (see [ADR 0012](../adrs/0012-show-failures-of-actions-as-toasts.md)).

## Terms

- **Action item**: one piece of work that the user was given in a meeting. It has a text and is either done or not done. The backend calls it a "task" (see [ADR 0010](../adrs/0010-store-tasks-in-their-own-table.md)).
- **Meeting details sidebar**: the column at the right side of the editor page, from the top to the bottom of the main area. It is a landmark named "Meeting details". It holds the meeting date, the Archive button, and the action items panel.
- **Action items panel**: the part of the meeting details sidebar that holds the checklist of action items. It is a region named "Action items".
- **Failure toast**: a toast that reports that an action failed. It shows a message and a "Close" button. Toasts are inside the region named "Notifications" (see [Spec 0004](0004-archive-meeting-notes.md)).
- **Check off**: to mark an action item as done by checking its checkbox. **Uncheck**: to mark it as not done again.

The terms "meeting", "Meetings page", and "editor page" are defined in [Spec 0001](0001-take-meeting-notes.md). Action items are separate from the "Task list" formatting of the notes editor, which makes a checklist inside the notes.

## Behavior

### Layout

- The meeting details sidebar is at the right side of the editor page. It starts at the top of the main area, beside the page header, and ends at the bottom of the window. The page header, the meeting name, the formatting toolbar, and the notes are at its left.
- The sidebar is always visible. It cannot be hidden.
- The sidebar is 288 pixels wide when the window is at most about 1070 pixels wide. In a wider window it is wider, by about 7.5 pixels for each 100 pixels of window width, up to 352 pixels.
- From top to bottom, the sidebar shows:
  1. a row with the label "Date" and the date field named "Meeting date",
  2. the "Archive" button,
  3. a separator,
  4. the action items panel.
- The meeting name is alone on its row, above the formatting toolbar. The page header shows the breadcrumb trail and the save status, and no longer shows the Archive button.
- The action items panel has the heading "Action items". Below it is the list of items, and at the bottom of the panel is a text field named "Add action item".
- When the list is taller than the space it has, only the list scrolls. The date, the Archive button, the heading, and the "Add action item" field stay in place, and the notes do not move.

### Date and Archive in the sidebar

- The date field works as described in [Spec 0001](0001-take-meeting-notes.md). A change is saved automatically with the name and the notes.
- The Archive button works as described in [Spec 0004](0004-archive-meeting-notes.md), except that a failure is reported in a failure toast, as described under "Messages".

### Showing action items

- When the editor page opens, the panel shows the action items of that meeting and only those. Action items of other meetings are not shown.
- Items are shown in the order in which they were added, the oldest first.
- Each item has, from left to right:
  - a checkbox named `Complete "<text>"`, such as `Complete "Send the deck"`, which is checked when the item is done,
  - a text field named "Action item" that holds the item's text. A long text wraps onto more lines, and the field grows so that the whole text is visible without scrolling. The checkbox and the remove button line up with the first line of the text,
  - a button named `Remove "<text>"`.
- For an item whose text is empty, `<text>` in these names is "Untitled action item".
- When the meeting has no action items, the panel says "No action items yet".
- While the items load, the panel says "Loading…". If they cannot be loaded, the panel says "Couldn't load action items" and shows a "Retry" button that loads them again. This message stays in the panel. It is not a toast. The rest of the editor page works as usual.

### Adding an action item

- When the user types text in the "Add action item" field and presses Enter, a new item with that text is added at the bottom of the list. It is not checked. The field becomes empty and keeps the focus, so the user can type the next item at once.
- Spaces at the start and at the end of the text are removed.
- When the field is empty or has only spaces, Enter does nothing.
- Enter never adds a line break to the "Add action item" field. When the user pastes text with line breaks, each line break becomes a space.
- A long text in the "Add action item" field wraps onto more lines, and the field grows so that the whole text is visible without scrolling. After the item is added, the empty field has the height of one line again.
- If the item cannot be added, the list does not change, the field keeps the text, and a failure toast says "Couldn't add the action item. Try again."

### Checking off an action item

- When the user checks an item's checkbox, the item is saved as done at once. Its text is grayed out: it is shown in the muted text color of the application instead of the normal text color.
- When the user unchecks it, the item is saved as not done, and its text is shown in the normal text color again.
- A checked item stays in its place in the list.
- If the change cannot be saved, the checkbox and the color of the text go back to the value that was last saved, and a failure toast says "Couldn't save the action item. Try again."

### Changing the text of an action item

- The user can change the text of any item, checked or not, in its "Action item" field.
- The change is saved automatically after the user pauses for about half a second. If the user leaves the editor page before the pause ends, the change is saved at once.
- If the change cannot be saved, the user's text stays in the field, and a failure toast says "Couldn't save the action item. Try again." The next change to that item tries to save again.
- The names of the item's checkbox and remove button use the item's new text.
- The text of an action item is one paragraph. Pressing Enter in an "Action item" field does not add a line break. When the user pastes text with line breaks, each line break becomes a space.

### Removing an action item

- When the user clicks an item's remove button, the item is deleted permanently. There is no confirmation and no undo.
- The remove button is always in the page for keyboard and screen reader users. It is visible only when the pointer is over the item's row or when the button has keyboard focus.
- After a removal, keyboard focus moves to the "Action item" field of the item that is now in the same position, which is the next item. If the removed item was the last one, focus moves to the "Action item" field of the item before it. If the list is now empty, focus moves to the "Add action item" field.
- A change to the item's text that was not yet saved is discarded. It does not cause an error.
- If the item cannot be removed, it stays in the list, and a failure toast says "Couldn't remove the action item. Try again."

### Messages

- These messages are shown in a failure toast: "Couldn't archive the meeting. Try again.", "Couldn't add the action item. Try again.", "Couldn't save the action item. Try again.", and "Couldn't remove the action item. Try again." The editor page and the action items panel show no other alert for them.
- A failure toast shows its message and a "Close" button, and no other button. It closes by itself 8 seconds after it appears. The time does not count while the pointer is over the toast or while the toast has keyboard focus. Keyboard focus does not move to the toast.
- At most one failure toast is open at a time. When another action fails, the open failure toast closes and a toast for the new failure appears. When an archive or a change to action items succeeds, the open failure toast closes.
- A failure toast stays open when the user opens another page, like the archive toast.
- A failure toast and the archive toast can be open at the same time.

### Keeping action items

- Action items and whether they are done are kept when the user leaves the editor page, and after the application is closed and opened again.
- Archiving a meeting does not change its action items.

## Changes to earlier specs

Merged specs are not changed. This spec changes them as follows:

- [Spec 0001](0001-take-meeting-notes.md): the date field is in the meeting details sidebar, not on the row of the meeting name. Its name is still "Meeting date".
- [Spec 0004](0004-archive-meeting-notes.md):
  - The "Archive" button of the editor page is in the meeting details sidebar, below the date, not in the page header next to the save status.
  - When a meeting cannot be archived, from the Meetings page or from the editor page, "Couldn't archive the meeting. Try again." is shown in a failure toast, not on the page. Everything else about a failed archive stays the same: the meeting stays in the list, or the editor page stays open with the user's text.

## Not checked by the executable specs

- That the 8 seconds of a failure toast stop while the pointer is over the toast or while it has focus. Base UI's toast provides this, as for the archive toast.
- That the remove button is hidden until the pointer is over the row. This depends on the pointer and CSS hover states. Check it by hand with `bun run tauri dev`.
- That action items are kept after the application is closed and opened again, and that archiving a meeting does not change its action items. These depend on the real database. The Rust tests of `src-tauri/src/tasks.rs` check them.

## Backend contract

The executable specs replace the Tauri backend with an in-memory fake. They rely on the commands of [Spec 0001](0001-take-meeting-notes.md) and these additions, which the real backend must provide:

| Command                   | Arguments                  | Result                                   |
| ------------------------- | -------------------------- | ---------------------------------------- |
| `list_meeting_tasks`      | `meetingId`                | list of the meeting's tasks, oldest first |
| `create_task`             | `meetingId`, `description` | the new task                             |
| `update_task_description` | `id`, `description`        | the task after the change                |
| `set_task_completed`      | `id`, `completed`          | the task after the change                |
| `delete_task`             | `id`                       | nothing (`null`)                         |

- A task has the fields `id`, `meetingId`, `description`, `createdAt`, `updatedAt`, and `completedAt`. `completedAt` is `null` for a task that is not done.
- `create_task` stores the description that it gets. The frontend removes the spaces at the start and at the end first.
- `set_task_completed` with `completed: true` records the time the task was completed. If the task is already completed, the time that was recorded first stays. With `completed: false`, it clears the time.
- `update_task_description` and `set_task_completed` change `updatedAt`.
- All commands reject with a message when no task or meeting has the identifier or the database reports an error.

## Out of scope

- A page that lists action items from all meetings.
- Action items that do not belong to a meeting. The database allows them, but the user interface cannot create them.
- Changing the order of action items.
- Undoing a removal.
- Due dates, owners, or other details of an action item.
- Hiding or resizing the meeting details sidebar.
