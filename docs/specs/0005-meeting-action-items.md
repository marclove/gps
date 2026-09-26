# Spec 0005: Meeting action items

Ticket: [0005 Meeting action items](../features/0005-meeting-action-items.md)

Executable specs: `src/features/tasks/action-items.spec.tsx` and `src/features/tasks/action-items.browser.spec.tsx`

## Summary

While writing the notes of a meeting, the user records the action items that they were given in that meeting. The action items are a checklist in a panel at the right side of the editor page. The user can add items, change their text, check them off when the work is done, and remove them. The text of a checked item is grayed out. Action items are saved automatically and belong to their meeting.

## Terms

- **Action item**: one piece of work that the user was given in a meeting. It has a text and is either done or not done. The backend calls it a "task" (see [ADR 0010](../adrs/0010-store-tasks-in-their-own-table.md)).
- **Action items panel**: the area at the right side of the editor page, below the page header, that holds the checklist of action items. It is a region named "Action items".
- **Check off**: to mark an action item as done by checking its checkbox. **Uncheck**: to mark it as not done again.

The terms "meeting", "Meetings page", and "editor page" are defined in [Spec 0001](0001-take-meeting-notes.md). Action items are separate from the "Task list" formatting of the notes editor, which makes a checklist inside the notes.

## Behavior

### Layout

- The action items panel is at the right side of the editor page, below the page header. The meeting name, the meeting date, the formatting toolbar, and the notes are at its left.
- The panel has the heading "Action items". Below it is the list of items, and at the bottom of the panel is a text field named "Add action item".
- The panel is always visible. It cannot be hidden.
- When the list is taller than the panel, only the list scrolls. The heading and the "Add action item" field stay in place, and the notes do not move.

### Showing action items

- When the editor page opens, the panel shows the action items of that meeting and only those. Action items of other meetings are not shown.
- Items are shown in the order in which they were added, the oldest first.
- Each item has, from left to right:
  - a checkbox named `Complete "<text>"`, such as `Complete "Send the deck"`, which is checked when the item is done,
  - a text field named "Action item" that holds the item's text,
  - a button named `Remove "<text>"`.
- For an item whose text is empty, `<text>` in these names is "Untitled action item".
- When the meeting has no action items, the panel says "No action items yet".
- While the items load, the panel says "Loading…". If they cannot be loaded, the panel says "Couldn't load action items" and shows a "Retry" button that loads them again. The rest of the editor page works as usual.

### Adding an action item

- When the user types text in the "Add action item" field and presses Enter, a new item with that text is added at the bottom of the list. It is not checked. The field becomes empty and keeps the focus, so the user can type the next item at once.
- Spaces at the start and at the end of the text are removed.
- When the field is empty or has only spaces, Enter does nothing.
- If the item cannot be added, the list does not change, the field keeps the text, and the panel says "Couldn't add the action item. Try again."

### Checking off an action item

- When the user checks an item's checkbox, the item is saved as done at once. Its text is grayed out: it is shown in the muted text color of the application instead of the normal text color.
- When the user unchecks it, the item is saved as not done, and its text is shown in the normal text color again.
- A checked item stays in its place in the list.
- If the change cannot be saved, the checkbox and the color of the text go back to what they were before, and the panel says "Couldn't save the action item. Try again."

### Changing the text of an action item

- The user can change the text of any item, checked or not, in its "Action item" field.
- The change is saved automatically after the user pauses for about half a second. If the user leaves the editor page before the pause ends, the change is saved at once.
- If the change cannot be saved, the user's text stays in the field, and the panel says "Couldn't save the action item. Try again." The next change to that item tries to save again.
- The names of the item's checkbox and remove button use the item's new text.

### Removing an action item

- When the user clicks an item's remove button, the item is deleted permanently. There is no confirmation and no undo.
- The remove button is always in the page for keyboard and screen reader users. It is visible only when the pointer is over the item's row or when the button has keyboard focus.
- After a removal, keyboard focus moves to the "Action item" field of the item that is now in the same position, which is the next item. If the removed item was the last one, focus moves to the "Action item" field of the item before it. If the list is now empty, focus moves to the "Add action item" field.
- A change to the item's text that was not yet saved is discarded. It does not cause an error.
- If the item cannot be removed, it stays in the list, and the panel says "Couldn't remove the action item. Try again."

### Messages

- The panel shows at most one of the messages "Couldn't add the action item. Try again.", "Couldn't save the action item. Try again.", and "Couldn't remove the action item. Try again." at a time, as an alert. A new message replaces the one before. The message goes away when the next change to action items succeeds.

### Keeping action items

- Action items and whether they are done are kept when the user leaves the editor page, and after the application is closed and opened again.
- Archiving a meeting does not change its action items.

## Not checked by the executable specs

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
- Hiding or resizing the action items panel.
