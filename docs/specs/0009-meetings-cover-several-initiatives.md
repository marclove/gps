# Spec 0009: Meetings that cover several initiatives

Ticket: [0009 Meetings that cover several initiatives](../features/0009-meetings-cover-several-initiatives.md)

Executable spec: `src/features/meetings/meeting-initiatives.spec.tsx`. It replaces `src/features/meetings/meeting-initiative.spec.tsx`, which checked the select box of Specs 0006, 0007, and 0008. The earlier specs `src/features/meetings/meeting-project.spec.tsx` and `src/features/initiatives/initiative-project.spec.tsx` now check the behavior of Spec 0008 with the changes that this spec describes under "Changes to earlier specs".

## Summary

A meeting covers any number of initiatives of its project, including none. In the meeting details sidebar, the user sees the initiatives of the meeting and chooses them with checkboxes in a popover. Each change is saved at once.

See [ADR 0021](../adrs/0021-store-the-initiatives-of-a-meeting-in-a-link-table.md) for how the initiatives of a meeting are stored and kept in the meeting's project, and [ADR 0022](../adrs/0022-choose-the-initiatives-of-a-meeting-in-a-popover-with-checkboxes.md) for the popover.

## Terms

- **Cover**: a meeting covers an initiative when the user has recorded that the meeting was about it. This replaces "assign" of Spec 0006.
- **Shown name**: the name of an initiative, or "Untitled initiative" when the name is empty, followed by " (deleted)" for a deleted initiative.
- **Popover**: the dialog named "Choose initiatives" that opens below the "Choose" button.

The terms "meeting" and "editor page" are defined in [Spec 0001](0001-take-meeting-notes.md). The terms "meeting details sidebar" and "failure toast" are defined in [Spec 0005](0005-meeting-action-items.md). The terms "initiative" and "sheet" are defined in [Spec 0006](0006-managing-initiatives.md). The terms "delete", "restore", and "delete toast" are defined in [Spec 0007](0007-deleted-rows-and-ranked-order.md). The term "project" is defined in [Spec 0008](0008-projects.md).

## Behavior

### The Initiatives row

- The meeting details sidebar shows an "Initiatives" row between the "Project" row and the "Delete" button. It replaces the "Initiative" row and its select box.
- The row has a button with the text "Choose", named "Choose initiatives", and a list named "Meeting initiatives".
- The list shows the shown name of each initiative that the meeting covers, sorted without regard to case. When the meeting covers no initiative, the row says "No initiatives" instead.
- The button is disabled while the initiatives load, and when the meeting has no project.
- If the initiatives cannot be loaded, the row says "Couldn't load initiatives" and has a "Retry" button. "Retry" loads them again.

### Choosing initiatives

- "Choose" opens the popover. It has one checkbox for each initiative of the meeting's project that is not deleted, also the completed ones, and one for each deleted initiative that the meeting covers. The label of each checkbox is the shown name. The checkboxes are sorted by the shown name without regard to case, in one list without groups.
- Initiatives of other projects, and deleted initiatives that the meeting does not cover, are not offered.
- A checkbox is checked when the meeting covers the initiative.
- When the project has no initiatives and the meeting covers none, the popover says "This project has no initiatives."
- Checking a checkbox adds the initiative to the meeting at once. Unchecking it removes the initiative at once. The list in the row shows the change at once. The meeting's name, date, and notes are not saved, and the save status does not change.
- The user can check and uncheck several checkboxes while the popover is open.
- If an initiative cannot be added, its checkbox is unchecked again, the list does not show it, and a failure toast says "Couldn't add the initiative. Try again." If an initiative cannot be removed, its checkbox is checked again, the list shows it again, and a failure toast says "Couldn't remove the initiative. Try again."
- When the user unchecks a deleted initiative and the removal is saved, it disappears from the popover and from the list.
- Escape closes the popover and moves the keyboard focus back to the "Choose" button.
- The initiatives stay on the meeting when the meeting opens again.
- If the user deletes an initiative and then clicks "Undo" in the delete toast while a meeting is open, the popover offers the initiative again.

### The project of a meeting

- When the meeting has no project, it covers no initiatives, and the "Choose" button is disabled.
- When the user changes the project of a meeting, the meeting no longer covers any initiative. The row says "No initiatives", and the popover offers the initiatives of the new project.
- A meeting that covers an initiative is about the project of that initiative.

### Moving an initiative to another project

When the user moves an initiative to another project in its sheet, each meeting that covers it changes as follows:

- If the meeting covers no other initiative, it moves to the new project too, and still covers the moved initiative.
- If the meeting covers another initiative, also a deleted or completed one, it stays in its project and no longer covers the moved initiative.

### Existing meetings

- A meeting that was assigned to one initiative before the update covers the same initiative after it, and keeps its project.

## Changes to earlier specs

Merged specs are not changed. This spec changes them as follows:

- [Spec 0006](0006-managing-initiatives.md), [Spec 0007](0007-deleted-rows-and-ranked-order.md), and Spec 0008: the "Initiative" row with the select box "Meeting initiative" is replaced by the "Initiatives" row described above. A meeting covers any number of initiatives instead of being assigned to at most one. The choices are no longer grouped by roadmap column and "Completed".
- Spec 0007: a deleted initiative that a meeting covers is shown with " (deleted)" in the list and in the popover, instead of as the last choice of the select box.
- Spec 0008: when an initiative moves to another project, a meeting that covers it moves with it only when it covers no other initiative. Otherwise the meeting stays and no longer covers the moved initiative.
- [Spec 0005](0005-meeting-action-items.md), Spec 0006, Spec 0007, and Spec 0008: the meeting details sidebar shows, from top to bottom, the "Date" row, the "Project" row, the "Initiatives" row, the "Delete" button, a separator, and the action items panel.

## Not checked by the executable specs

- The migration: that each meeting that was assigned to an initiative covers that initiative and keeps its project, that meetings without an initiative cover none, and that `meetings` no longer has the column `initiative_id`. The unit tests of the migration in `src-tauri/src/db.rs` check this.
- That the real backend keeps the initiatives of a meeting in its project: that adding an initiative of another project changes the project of the meeting and removes its other initiatives, that changing the project removes all initiatives, that adding a deleted initiative is refused, and that a move of an initiative follows the rules above. The unit tests in `src-tauri/src/meetings.rs` and `src-tauri/src/initiatives.rs` check this. The fake backend of the executable specs does the same, and the specs check what the user sees.
- That `docs/data-model.md` shows the table `meeting_initiatives` and no longer shows `meetings.initiative_id`. A reviewer checks this.

## Backend contract

The executable specs replace the Tauri backend with an in-memory fake. They rely on the commands of the earlier specs, with the changes below, which the real backend must provide. Arguments and results use camelCase names.

| Command                     | Arguments            | Result      |
| --------------------------- | -------------------- | ----------- |
| `add_meeting_initiative`    | `id`, `initiativeId` | the meeting |
| `remove_meeting_initiative` | `id`, `initiativeId` | the meeting |

- `add_meeting_initiative` refuses an initiative that is deleted or does not exist. It changes nothing when the meeting already covers the initiative. When the initiative belongs to another project than the meeting, it sets the project of the meeting to the project of the initiative and removes the other initiatives of the meeting.
- `remove_meeting_initiative` changes nothing when the meeting does not cover the initiative. It does not change the project of the meeting.

The existing commands change as follows:

- A meeting has `initiativeIds`, the identifiers of the initiatives that it covers, also deleted ones, in ascending order, in place of `initiativeId`. The summary of a meeting does not change.
- `set_meeting_initiative` is removed.
- `set_meeting_project` removes all initiatives of the meeting when the project changes.
- `set_initiative_project` moves a meeting that covers the initiative to the new project only when the meeting covers no other initiative. Otherwise it removes the initiative from the meeting.

## Out of scope

- A list of the meetings of an initiative, for example in its sheet.
- Undoing the removal of an initiative from a meeting with a toast.
- A search field in the popover.
