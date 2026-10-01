# Spec 0010: The Work section

Ticket: [0010 The Work section](../features/0010-work-section.md)

Executable specs: `src/features/work/work.spec.tsx`, `src/features/work/task-sheet.spec.tsx`, `src/features/work/work.browser.spec.tsx`, `src/features/tasks/action-items-work.spec.tsx`, and `src/features/projects/project-tasks.spec.tsx`. The earlier specs `src/features/tasks/action-items.spec.tsx` and `src/features/projects/projects.spec.tsx` now check the behavior of Specs 0005 and 0008 with the changes that this spec describes under "Changes to earlier specs".

## Summary

The user keeps every task that they must do in one place, the Work section. A new task waits in the Icebox until the user prioritizes it. Prioritized tasks form one ordered list: the started ones are in Current and the others in the Backlog, and the task at the top of the Backlog is the next piece of work to start. Completed tasks are in Done. The user moves tasks between these stages by dragging them, and with the "Reopen" button. Each task can have a description, a project, and an initiative, which the user edits in a sheet that opens from every page that shows the task. The action items of a meeting are tasks too.

See [ADR 0023](../adrs/0023-store-the-stage-of-a-task-in-its-columns.md) for how tasks, their stages, and their order are stored, [ADR 0024](../adrs/0024-share-one-board-between-the-roadmap-and-the-work-section.md) for the board, and [ADR 0025](../adrs/0025-edit-tasks-in-a-sheet-that-any-page-can-open.md) for the sheet.

## Terms

- **Task**: one piece of work that the user must do. It has a title, a description, and optionally a project, an initiative, and the meeting that it came from. In a meeting, a task is called an action item, as in [Spec 0005](0005-meeting-action-items.md).
- **Board**: the four columns of the Work page. From left to right: Current, Backlog, Icebox, and Done.
- **Card**: a task on the board.
- **Stage**: the column of a task: Current, Backlog, Icebox, or Done.
- **Icebox**: the stage of a task that is not prioritized yet.
- **Prioritize**: to move a task from the Icebox into the Backlog or into Current.
- **The list**: the one ordered list of prioritized tasks. Current shows the started tasks of the list, and the Backlog shows the others, each in the order of the list.
- **Start**: to move a task from the Backlog to Current. **Complete**: to move a task to Done. **Reopen**: to move a task out of Done.
- **Held place**: the place of a task in the list, which the task keeps while it is completed or deleted. A task in the Icebox has no held place.
- **Task sheet**: the panel at the right side of the window in which the user edits one task. It is a modal dialog.
- **Shown title**: the title of a task, or "Untitled task" when the title is empty. In a meeting, "Untitled action item" is used instead, as before.

The terms "meeting" and "editor page" are defined in [Spec 0001](0001-take-meeting-notes.md). The terms "meeting details sidebar", "action items panel", "failure toast", "check off", and "uncheck" are defined in Spec 0005. The terms "initiative", "roadmap", and "sheet" are defined in [Spec 0006](0006-managing-initiatives.md). The terms "delete", "restore", and "delete toast" are defined in [Spec 0007](0007-deleted-rows-and-ranked-order.md). The terms "project", "project page", and "draft" are defined in [Spec 0008](0008-projects.md). The term "cover" is defined in [Spec 0009](0009-meetings-cover-several-initiatives.md).

## Behavior

### Section

- The sidebar of the application has a link named "Work". It shows a checklist icon, and its tooltip says "Work". The sidebar shows its links in this order, from the top: "Work", "Meetings", "Initiatives", and "Projects".
- The link opens the Work page. While the Work page is open, the "Work" link is marked as the current page.
- The application still opens on the Meetings page.

### The board

- The page header shows the breadcrumb "Work" and a button named "New task".
- Below the header, the board fills the rest of the main area. It has four columns of equal width, from left to right: Current, Backlog, Icebox, and Done. Each column is a region named after the column, with a heading that shows the name and the number of cards in the column, such as "Backlog 3".
- The board shows every task that is not deleted, also the tasks of deleted meetings.
- Current and Backlog show their cards in the order of the list, from the top. The Icebox shows its cards by the time they were created, the newest at the top. Done shows its cards by the time of completion, the task completed last at the top.
- A column with no cards says "No tasks".
- Each card shows the shown title, and the name of its project, or "Untitled project", when the task has a project. A card in Done also shows a check mark, and its text is muted.
- Each card has a button whose accessible name starts with the shown title. Clicking it, or pressing Enter while it has keyboard focus, opens the task sheet.
- Each card in Done has a button named `Reopen "<shown title>"`. Cards in Current, the Backlog, and the Icebox have no such button.
- While the tasks load, the columns show their headings and no cards. If they cannot be loaded, the board is replaced by the text "Couldn't load tasks" and a "Retry" button that loads them again.
- When a column has more cards than fit in the window, only that column's cards scroll. The page header and the headings of the columns stay in place, and the window does not scroll.

### Creating a task in the sheet

- When the user clicks "New task", the task sheet opens for a draft. The draft has an empty title, an empty description, no project, and no initiative. No task is saved, and no card is added.
- The "Task title" field has keyboard focus.
- The draft sheet has no "Delete" button and no save status.
- The draft is saved as a task only after the user changes it: a title that is not empty after removing the spaces at its start and end, a project, an initiative, or any text in the description. A title or a description is saved after the user pauses, or at once when the sheet closes. A project or an initiative is saved at once.
- When the draft is saved, its card appears at the top of the Icebox, and the sheet shows the save status and the "Delete" button.
- If the user closes the draft without such a change, nothing is saved, and keyboard focus goes back to the "New task" button.

### Dragging cards with the pointer

- The user drags a card by pressing the pointer on it and moving it. A drag starts only after the pointer moves 8 pixels, so a click opens the task sheet and does not move the card.
- While a card is dragged, the cards of Current and the Backlog make room for it at the place where it would drop.
- A card dropped in Current or the Backlog goes to the place where it was dropped, in the same column or the other one, including an empty column. A card dropped in Current is started. A card dropped in the Backlog is not started. The order of the other cards does not change.
- A card dragged from the Icebox and dropped in Current or the Backlog is prioritized.
- A card dragged from Current or the Backlog and dropped in the Icebox is no longer prioritized and no longer started. It appears in the Icebox at the place given by the time it was created, wherever in the Icebox it was dropped. Dragging a card inside the Icebox does not change the order of the Icebox.
- A card dropped in Done, from Current, the Backlog, or the Icebox, completes the task. It appears at the top of Done, wherever in Done it was dropped. It keeps its held place.
- Cards in Done cannot be dragged. The "Reopen" button is the only way to move a card out of Done on the board.
- The new place of a card is kept when the user leaves the page and opens it again.
- If the new place cannot be saved, the card goes back to the place it had before the drag, and a failure toast says "Couldn't move the task. Try again."

### Dragging cards with the keyboard

- When a card has keyboard focus, pressing Space picks it up. Cards in Done cannot be picked up.
- While a card is picked up, the Up and Down arrow keys move it one place in its column, and the Left and Right arrow keys move it to the column at that side. Pressing Space drops it, with the same results as a drop with the pointer. Pressing Escape puts it back where it was.
- Screen readers announce each step:
  - `Picked up <shown title>.` when the card is picked up,
  - `<shown title> is in <column>, position <n> of <count>.` after each move,
  - `<shown title> was moved to <column>, position <n> of <count>.` after a drop in Current or the Backlog,
  - `<shown title> was moved to Icebox.` after a drop in the Icebox,
  - `<shown title> was completed.` after a drop in Done,
  - `<shown title> was put back.` after Escape.

  Positions count from 1. The message after each move is also given while the card is over the Icebox or Done, with the position that the card has there during the drag.
- Pressing Space on a card in Done does nothing.
- After a drop, keyboard focus stays on the card in its new place.

### Reopening a task

- When the user clicks the "Reopen" button of a card in Done, the task returns to its held place: to Current if it was started, to the Backlog if it was prioritized and not started, and to the Icebox if it was not prioritized.
- In Current and the Backlog, the reopened card appears after every card that was above it when it was completed and has not been moved since, and before every card that was below it and has not been moved since. If a card has taken its held place in the meantime, the reopened card appears directly after that card.
- If the task cannot be reopened, the card stays in Done, and a failure toast says "Couldn't reopen the task. Try again."

### The task sheet

- The task sheet opens from the right side of the window and is as tall as the window. The page behind it stays visible at its left, dimmed. The sheet is a dialog whose accessible name is the shown title.
- From top to bottom, the sheet shows:
  1. a text field named "Task title" and the save status. When the title is empty, the field shows "Untitled task" as a placeholder.
  2. a select box named "Project",
  3. a select box named "Initiative",
  4. for a task that came from a meeting only, the label "Meeting" and a link that shows the name of the meeting. For a deleted meeting, the name is followed by " (deleted)" and is plain text, not a link.
  5. for a completed task only, the text `Completed on <date>`, such as "Completed on September 26, 2026", in the user's local time zone,
  6. the formatting toolbar and the description, in an editor named "Description", with the same formatting as the notes of a meeting,
  7. a button named "Delete" and a button named "Save".

  A button named "Close" is at the top right corner of the sheet. It comes last in the order of the keyboard focus, after "Save".
- The "Project" select box has the choice "No project", then the projects that are not deleted, sorted by the shown name without regard to case. When the task has a project that was deleted after the user chose it, that project is also a choice, with " (deleted)" after its name, and it is selected.
- The "Initiative" select box has the choice "No initiative", then the initiatives of the selected project that are not deleted, also completed ones, sorted by the shown name without regard to case. When the task has an initiative that was deleted after the user chose it, that initiative is also a choice, with " (deleted)" after its name, and it is selected. The select box is disabled when the task has no project.
- The link to the meeting closes the sheet and opens the editor page of the meeting.
- When the description is taller than the space it has, only the description scrolls.
- The "Save" button, the "Close" button, the Escape key, and a click on the dimmed page close the sheet. "Save" does nothing else. A change that was not yet saved is saved when the sheet closes. On the Work page, keyboard focus then goes back to the card of the task.
- While the task loads, the fields are disabled. If it cannot be loaded, the sheet says "Couldn't load the task" and shows a "Retry" button.

### Saving a task

- Changes to the title and the description are saved automatically after the user pauses for about half a second. The save status shows "Saving…", "Saved", or "Couldn't save" with a "Retry" button, as in the sheet of an initiative.
- A title is saved without the spaces at its start and end. The card and the title of the sheet show the saved title.
- A choice in the "Project" or the "Initiative" select box is saved at once. If it cannot be saved, the select box shows the choice that was saved last, and a failure toast says "Couldn't change the project. Try again." or "Couldn't change the initiative. Try again."
- When the user chooses an initiative, the task gets the project of that initiative.
- When the user chooses another project, the task no longer has an initiative, and the "Initiative" select box shows "No initiative". When the user chooses "No project", the task has no project and no initiative.
- After a change is saved, the card shows the new title and project. The card stays in its place.
- The changes are kept when the user closes the sheet and opens it again.

### Deleting a task

- When the user clicks "Delete" in the task sheet, a change that was not yet saved is saved, the task is deleted, the sheet closes, and the task is removed from every list that showed it. There is no confirmation dialog, because the delete can be undone.
- On the Work page, keyboard focus then moves to the "New task" button.
- The delete toast says `Deleted "<shown title>".` and has an "Undo" button and a "Close" button.
- When the user clicks "Undo", the task is restored to its stage. In Current and the Backlog, it returns to its held place by the same rules as a reopened task. A completed task goes back to Done.
- If the task cannot be deleted, a failure toast says "Couldn't delete the task. Try again." If it cannot be restored, the text of the delete toast changes to "Couldn't restore the task. Try again.", and "Undo" stays, so the user can try again.

### Action items

The action items panel of a meeting works as Spec 0005 describes, with these changes:

- Each action item is a task. It appears on the board of the Work page too, in the stage that it has. A new action item appears at the top of the Icebox.
- A new action item gets the project of the meeting, unless that project is deleted. If the meeting covers exactly one initiative that is not deleted, the action item gets that initiative too. Otherwise it has no initiative.
- Checking off an action item completes the task, wherever it is on the board. Unchecking it reopens the task, as the "Reopen" button does. Completing a task on the board checks its action item, and reopening it unchecks the action item.
- Each item has a button named `Open "<text>"`, between the text field and the remove button. It opens the task sheet over the editor page. After a change in the sheet is saved, the item shows the new title. When the task is deleted in the sheet, the item leaves the list.
- The remove button deletes the task. The delete toast says `Deleted "<text>".` and has an "Undo" button. "Undo" restores the task, as described under "Deleting a task". While the editor page of the meeting is open, the item comes back in its place in the list, which stays sorted by the time the items were added.
- The list of action items does not show deleted tasks.

### The tasks of a project

- The sidebar "Project details" of the project page shows, from top to bottom, the "Delete" button, the list "Initiatives", the list "Meetings", and the list "Tasks". The list "Tasks" is a region named after its heading.
- The list "Tasks" shows the tasks of the project that are not completed and not deleted: the tasks in Current, then the tasks in the Backlog, each in the order of the list, then the tasks in the Icebox, the newest first. Each row is a button that shows the shown title.
- An empty list says "No tasks".
- Clicking a row opens the task sheet over the project page. After a change in the sheet, the list shows the new title. When the task moves to another project, or is deleted, it leaves the list. "Undo" in the delete toast brings it back.

### The tasks of an initiative

- The sheet of a saved initiative shows a list "Tasks" below the description and above the "Delete" and "Save" buttons. It is a region named after its heading. It shows the tasks of the initiative that are not completed and not deleted, in the same order and with the same rows as the list of a project. An empty list says "No tasks". The sheet of a draft does not show the list.
- Clicking a row saves a change that was not yet saved, closes the sheet of the initiative, and opens the task sheet in its place. Only one sheet is open at a time.
- When an initiative moves to another project, its tasks move to that project too.

### Deleting a project

Deleting a project works as Spec 0008 describes, with this change:

- A project that has no initiatives that are not deleted, but has tasks that are not deleted, including completed ones, is not deleted. A failure toast says `Couldn't delete "<name>" because it still has tasks.`
- A project that has initiatives that are not deleted is refused with the message of Spec 0008, whether or not it has tasks.

### Existing action items

- After the update of the application, each action item that was not checked off is in the Icebox, and each checked action item is in Done.
- Each existing action item gets the project of its meeting, unless that project is deleted. If its meeting covers exactly one initiative that is not deleted, the action item gets that initiative too.

## Changes to earlier specs

Merged specs are not changed. This spec changes them as follows:

- [Spec 0003](0003-compact-section-nav.md), Spec 0006, and Spec 0008: the sidebar has a fourth link, "Work", and the links are in the order "Work", "Meetings", "Initiatives", "Projects". "Projects" moves from the top to the bottom.
- Spec 0005: the remove button of an action item deletes the task with a delete toast and "Undo", instead of removing it for good. If the action item cannot be removed, a failure toast says "Couldn't remove the action item. Try again.", as before. Each item has an "Open" button between the text field and the remove button. Action items are also tasks on the board of the Work page.
- Spec 0006: the sheet of a saved initiative shows the list "Tasks" between the description and the buttons.
- Spec 0008: the sidebar of the project page shows the list "Tasks" below the list "Meetings". A project that still has tasks is not deleted.

## Not checked by the executable specs

- The migration: that each existing task keeps its title, meeting, and completion, that an open task is in the Icebox and a completed one in Done, that each task gets the project of its meeting and the initiative of a meeting that covers exactly one, and that the database refuses two prioritized tasks with the same rank. The unit tests in `src-tauri/src/db.rs` and `src-tauri/src/tasks.rs` check this.
- That the real backend keeps the project and the initiative of a task consistent, moves the tasks of an initiative with it, refuses to delete a project with tasks, and places moved, started, reopened, and restored tasks by the rules above. The unit tests in `src-tauri/src/tasks.rs`, `src-tauri/src/initiatives.rs`, and `src-tauri/src/projects.rs` check this. The fake backend of the executable specs does the same, and the specs check what the user sees.
- That a card in Done shows a check mark and muted text. This is a visual detail, which a reviewer checks, as for the roadmap.
- That `docs/data-model.md` shows the new columns of `tasks`. A reviewer checks this.

## Backend contract

The executable specs replace the Tauri backend with an in-memory fake. They rely on the commands of the earlier specs, with the changes below, which the real backend must provide. Arguments and results use camelCase names.

A task has `id`, `meetingId`, `title`, `description`, `projectId`, `initiativeId`, `rank`, `createdAt`, `updatedAt`, `startedAt`, `completedAt`, and `deletedAt`. `meetingId`, `projectId`, `initiativeId`, `rank`, `startedAt`, `completedAt`, and `deletedAt` can be `null`.

| Command                   | Arguments                                              | Result                                                              |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `list_tasks`              | none                                                   | the tasks that are not deleted, in any order                        |
| `get_task`                | `id`                                                   | the task, also a deleted one, or `null`                             |
| `create_task`             | `title`, `description`, `projectId`, `initiativeId`    | the task, in the Icebox                                             |
| `create_meeting_task`     | `meetingId`, `title`                                   | the task, in the Icebox, with the project and initiative of the meeting |
| `update_task_description` | `id`, `description`                                    | the task                                                            |
| `set_task_project`        | `id`, `projectId` or `null`                            | the task                                                            |
| `set_task_initiative`     | `id`, `initiativeId` or `null`                         | the task                                                            |
| `move_task`               | `id`, `destination`, `index`                           | the task                                                            |
| `start_task`              | `id`                                                   | the task                                                            |
| `restore_task`            | `id`                                                   | the task                                                            |

- `create_task` removes the spaces at the start and the end of the title. When `initiativeId` is not `null`, the task gets the project of that initiative, whatever `projectId` is. It refuses a deleted project or initiative.
- `create_meeting_task` replaces `create_task` of Spec 0005. It gives the task the project of the meeting, unless that project is deleted, and the initiative of the meeting when the meeting covers exactly one initiative that is not deleted.
- `set_task_project` clears `initiativeId` when the initiative belongs to another project. Setting `null` clears both. It refuses a deleted project.
- `set_task_initiative` also sets `projectId` to the project of the initiative. Setting `null` keeps the project. It refuses a deleted initiative.
- `move_task` takes a `destination` of `"current"`, `"backlog"`, `"icebox"`, or `"done"`. For `"current"` and `"backlog"`, `index` is the place among the cards of that column, from 0, without the moved card. The task goes directly after the card of that column above the place, or directly before the card below it when the place is at the top, or to the end of the list when the column has no other card. The task is started for `"current"` and not started for `"backlog"`. For `"icebox"`, the task loses its rank and is no longer started. For `"done"`, the task is completed and keeps its rank and start. `index` is ignored for `"icebox"` and `"done"`. A completed or deleted task is refused.
- `start_task` starts a task in the Backlog and keeps its rank. It refuses a task that is not in the Backlog.
- `set_task_completed` with `false` reopens the task as described under "Reopening a task". With `true`, it completes the task wherever it is, and keeps its rank and start.
- `delete_task` sets `deletedAt` instead of removing the task. `restore_task` clears it and returns the task to its held place.

The existing commands change as follows:

- `list_meeting_tasks` returns only the tasks that are not deleted.
- `delete_project` answers `{ status: "hasTasks" }` and changes nothing when the project has no initiative that is not deleted but has a task that is not deleted.
- `set_initiative_project` also sets `projectId` of every task of the initiative, also the completed and deleted ones.
- Checking off or unchecking a task no longer changes its `updatedAt`.

## Out of scope

- Filtering the board by project.
- A limit on the number of tasks in Current.
- An order of the user's own in the Icebox.
- A page of deleted tasks, and restoring a task after its delete toast has closed.
- Showing completed tasks on the project page or in the sheet of an initiative.
- Where a task from outside the application came from, other than what the user writes in its description.
