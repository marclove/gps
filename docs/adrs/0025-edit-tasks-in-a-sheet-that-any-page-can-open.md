# 25. Edit tasks in a sheet that any page can open

Date: 2026-09-29

## Status

Proposed

Builds on [ADR 0015](0015-edit-initiatives-in-a-sheet.md), which edits an initiative in a sheet that is state of the page, and [ADR 0016](0016-share-editor-parts-between-meetings-and-initiatives.md), which shares the editor, the automatic saving, and the delete provider between features. Supersedes the permanent delete of an action item in the user interface, which [ADR 0010](0010-store-tasks-in-their-own-table.md) decided. ADR 0023 makes the delete of a task one that can be undone in the backend.

## Context

Feature ticket 0010 gives each task a description, a project, and an initiative, and asks for a task to be edited "in a sheet, as I edit an initiative". A sheet is a panel that slides in from the right side of the window, over the page. It is a modal dialog (ADR 0015). Spec 0010 lists what the task sheet shows: the title with the save status, a "Project" select box, an "Initiative" select box, a link to the meeting that the task came from, the date of completion, the description in the Markdown editor, and "Delete" and "Save" buttons.

The user opens a task from four places:

- a card on the board of the Work page,
- the `Open "<text>"` button of an action item, in the action items panel of the meeting editor page (`src/features/tasks/action-items-panel.tsx`),
- a row of the list "Tasks" on the project page,
- a row of the list "Tasks" in the sheet of an initiative. The sheet of an initiative opens on the Initiatives page and on the project page.

Each of these places shows the task, so each must show a change that the sheet saves, and must remove the task when it is deleted.

The initiative sheet shows how this works for one kind of item:

- `InitiativeSheet` (`src/features/initiatives/initiative-sheet.tsx`) loads the initiative and shows its form. For a draft, it shows an empty form, and saves the initiative only after the first real change.
- `useInitiativeSheet` (`use-initiative-sheet.ts`) holds the open initiative as state of the page: an identifier, `"new"` for a draft, or nothing. It opens and closes the sheet, deletes through the delete provider, and moves the focus to "New initiative" after a delete.
- The sheet calls `onSaved` after each save that succeeds, and the page updates its card or its row.
- The delete provider (`src/components/delete-provider.tsx`) deletes an item, shows the delete toast with "Undo", and restores the item. Its table `KINDS` has one entry for each kind of item: meetings, initiatives, and projects. Its `version` counts every delete and restore, and pages load their lists again when it changes.

The application uses a `MemoryRouter`, and the window has no address bar (ADR 0002).

We had to decide:

- whether the open task is a route or state of a page,
- how the sheet is shared between the four places,
- what happens when a task is opened from the sheet of an initiative, which is already a sheet,
- how drafts and saving work,
- how the lists that show a task learn about changes, deletes, and restores,
- how deleting an action item changes.

## Decision

### One sheet, one hook

The Work feature has a `TaskSheet` component and a `useTaskSheet` hook, in `src/features/work/`, built in the same way as `InitiativeSheet` and `useInitiativeSheet`. The meeting editor page, the project page, and the Initiatives page import them, as the project page imports the initiative sheet today (ADR 0020).

- `useTaskSheet` holds the open task as state of the page that uses it: the identifier of a task, `"new"` for a draft, or nothing. It gives `openTask(id)`, `openDraft()`, and the props of `TaskSheet`. It takes the callbacks that the page needs: what to do after a delete, and after a save.
- `TaskSheet` loads the task with `get_task` each time it opens, because the lists that open it do not all hold the description and the other fields. While it loads, the fields are disabled, and if it cannot load, it says "Couldn't load the task" with a "Retry" button, as the initiative sheet does.
- The title of the sheet, which is its accessible name, comes from the task that the sheet loaded and saved, not from the page. Not every page that opens the sheet holds the task.

### State, not a route

The open task is state of the page, not a route such as `/work/12`. This is the reason of ADR 0015: without an address bar, a route gives no link to share or to bookmark, and going back would open and close sheets. A route would also tie the sheet to the Work page, while it opens over three other pages, and each of them already has its own route. The breadcrumb of the page does not change while the sheet is open.

### One sheet at a time

The sheet of an initiative can show the list "Tasks" of the initiative. A click on a row there does not open a second sheet over the first. Instead:

1. The initiative form saves the change that waits, with the `flush` of `useAutosave`.
2. The page closes the sheet of the initiative.
3. The page opens the task sheet in its place.

The `InitiativeSheet` gets a callback, `onOpenTask(id)`, from the page that shows it. The page that owns the initiative sheet also owns a `useTaskSheet`, and its callback closes one sheet and opens the other. If the save of the initiative fails, the initiative sheet stays open and shows "Couldn't save" with "Retry", so the user does not lose a change without seeing it. Closing the task sheet does not open the initiative sheet again.

On the project page, the page itself owns the `useTaskSheet`. It gives `openTask` to its list "Tasks" and to the initiative sheet of its list "Initiatives", so that a task opened from either place updates the list "Tasks" of the page.

### Drafts

"New task" on the Work page opens the sheet for a draft, as "New initiative" does (ADR 0015): a task with an empty title, an empty description, no project, and no initiative, which exists only in the sheet. The "Task title" field gets the focus. The draft is saved with `create_task` only after a real change: a title that is not empty after removing the spaces at its start and end, a project, an initiative, or any text in the description. A title or a description is saved after the user pauses, or when the sheet closes. A project or an initiative is saved at once. After the first save, the sheet goes on to edit the saved task in the same form, and the Work page adds its card at the top of the Icebox. A draft that the user closes without a change saves nothing.

Only the Work page opens drafts. The Icebox "Add task" field and the action items panel create tasks with a title at once.

### Saving

- The title and the description are saved automatically with `useAutosave` (ADR 0016), with `update_task_title` and `update_task_description`. The save status is the shared `SaveStatus`, with "Retry".
- The "Project" and "Initiative" select boxes save at once, with `set_task_project` and `set_task_initiative`, in the same way as the project of an initiative (ADR 0020) and the initiatives of a meeting (ADR 0021). They do not wait for the pause of the autosave, because a choice is one action. The backend keeps the initiative consistent with the project (ADR 0023), and the sheet shows the task that the command returns: after a change of project, the "Initiative" select box shows "No initiative" when the backend cleared it. If a choice fails, the select box goes back to the saved choice, and a failure toast says so.
- The select boxes offer the projects and initiatives that are not deleted. A deleted project or initiative that the task already has is also offered, with " (deleted)" after its name, and is selected. The sheet loads the projects and the initiatives with `list_projects` and `list_initiatives`, including deleted ones, for this.
- For a task from a meeting, the sheet loads the meeting with `get_meeting`, which also returns a deleted meeting. The link to the meeting closes the sheet and opens the meeting editor page. Closing saves the change that waits, as for any close. A deleted meeting is shown as plain text.
- "Save", "Close", Escape, and a click on the dimmed page close the sheet, and closing saves a change that waits, as in ADR 0015.

### How the lists learn about changes

- **Saves.** After each save that succeeds, the sheet calls `onSaved` with the task. The page gives the task to the list that shows it: the Work page replaces the card, which stays at its place; the action items panel updates the title of the item; the project page updates its row, or removes it when the task moved to another project. The Initiatives page shows no tasks, so it ignores the call. The sheet of an initiative loads its list "Tasks" each time it opens, so it needs nothing.
- **Deletes and restores.** They go through the delete provider. Each list that shows tasks loads them again when `version` of the delete provider changes, as the lists of meetings, initiatives, and projects do. On the Work page, the board then shows a restored task in its stage and at its held place. On the meeting page, a restored action item comes back at its place in the list, which is sorted by the time the items were added.

The page does not load the whole list again after a save, so a save cannot move a card that the user is dragging (ADR 0015).

The action items panel must save a change to the text of an item that waits in its own autosave before it opens the sheet, so that the sheet loads the current title. While the sheet is open, the page behind it does not take input, so the item and the sheet cannot edit the title at the same time.

### Deleting

The delete provider gets a fourth kind, `"task"`, in its table `KINDS`:

- the commands `delete_task` and `restore_task`,
- the name "Untitled task" for an empty title,
- the toast `Deleted "<name>".`,
- the failure text "Couldn't restore the task. Try again.", after which "Undo" stays so that the user can try again.

`restore_task` always restores a task (ADR 0023), so the texts for a name that is taken and for a deleted project are never used for tasks.

- "Delete" in the sheet saves the change that waits, deletes the task through the provider, closes the sheet, and calls the callback of the page, which removes the task from its list. On the Work page, the focus then goes to "New task", because the card that opened the sheet is gone. If the delete fails, the sheet stays open, and a failure toast says "Couldn't delete the task. Try again."
- **The remove button of an action item now deletes through the provider**, with the delete toast and "Undo". This replaces the permanent delete of ADR 0010 in the user interface. The panel gives the provider the shown name of the item, which is "Untitled action item" for an empty text, so that the toast uses the same words as the buttons of the item. If the delete fails, the failure toast says "Couldn't remove the action item. Try again.", as before.

The kind `"project"` also learns the new refusal of ADR 0023. When `delete_project` answers `hasTasks`, the provider rejects with the text `Couldn't delete "<name>" because it still has tasks.`, and shows no delete toast, as it does for `hasInitiatives` (ADR 0020).

## Consequences

- The user edits a task in one way on four pages, and the sheet, its saving, and its delete are written once.
- The initiative sheet gets a new prop, and the pages that show it must provide it. The Initiatives page renders a task sheet that only the list of an initiative opens.
- Four pages react to `onSaved` and to `version` for tasks. A page that shows tasks later must do the same.
- A delete of any kind makes every list of tasks on the page load again, which is one extra load when another kind changed, as ADR 0016 accepted.
- Deleting an action item can be undone, and a deleted action item stays in the database.
- The sheet is narrower than a page. A long description scrolls inside the sheet, as for initiatives. If a task later needs lists of its own, the sheet may need to become a page, and that change needs its own decision.

## Alternatives considered

- **A route for the open task**, such as `/work/:taskId`. It gives nothing without an address bar, it makes going back open and close sheets, and it would take the user to the Work page when they open a task from a meeting or a project.
- **Open a task by going to the Work page** with its sheet open. The user would leave the meeting or the project to change one task, and would have to find the way back. ADR 0020 rejected this for the initiatives of a project.
- **Edit tasks inline on their cards**, such as the title in a text field. A card has no room for the description, the project, and the initiative, and a card that is also a drag handle and a text field conflicts on the pointer and on Space.
- **Open the task sheet over the initiative sheet.** Two modal sheets on top of each other take two Escapes to leave, and it is unclear which sheet a click on the dimmed page closes. The ticket asks for one sheet at a time.
- **A provider for the task sheet around the whole application**, with an `openTask` that any page can call. It would give one sheet everywhere without each page owning a hook, but every list would then need another way than `onSaved` to learn about saves, and the sheet would stay open when the page under it changes.
- **A second provider for the delete toast of tasks.** It would duplicate the provider, and two toasts with "Undo" could be open at the same time, which ADR 0016 rejected.
