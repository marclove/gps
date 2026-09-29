# 22. Choose the initiatives of a meeting in a popover with checkboxes

Date: 2026-09-28

## Status

Accepted

Supersedes the parts of ADR 0013 and ADR 0020 that show the initiative of a meeting in a select box.

## Context

Feature ticket 0009 lets a meeting cover several initiatives of its project. ADR 0021 stores them in the table `meeting_initiatives`, and gives the frontend the commands `add_meeting_initiative` and `remove_meeting_initiative`.

Today the meeting details sidebar (ADR 0011) has an "Initiative" row below the "Project" row (ADR 0020). The row is a native select box, labeled "Meeting initiative". It offers an empty choice, then the initiatives of the meeting's project in groups: one group for each roadmap column (Now, Next, Later) in roadmap order, then "Completed" in alphabetical order. If the initiative of the meeting is deleted, it is the last choice, outside the groups, until the user chooses another one. The select box is disabled when the meeting has no project. A choice is saved at once, and a failure shows a failure toast (ADR 0012) and puts back the saved choice. If the initiatives cannot be loaded, the row shows "Couldn't load initiatives" and a "Retry" button. The choices load again after an item is deleted or restored, for example with "Undo".

A select box can show one choice only. We had to decide how the user sees and changes several initiatives in a sidebar that is 18rem to 24rem wide (ADR 0011), where a project can have many initiatives.

## Decision

### The row

The row is labeled "Initiatives", and stays between the "Project" row and the "Delete" button.

- The first line of the row has the label at the left and a button at the right. The button shows the text "Choose", and its accessible name is "Choose initiatives".
- Below that line is a list named "Meeting initiatives". It has one item for each initiative that the meeting covers, sorted by the shown name without regard to case. The shown name is the name of the initiative, or "Untitled initiative" when the name is empty. A deleted initiative shows " (deleted)" after its name. When the meeting covers no initiative, the row shows the text "No initiatives" in place of the list.
- The button is disabled while the initiatives load, and when the meeting has no project. A meeting without a project covers no initiatives.
- If the initiatives cannot be loaded, the row shows "Couldn't load initiatives" and a "Retry" button in place of the "Choose" button and the list, as other rows of the sidebar do.

### The popover

"Choose" opens a popover below the button. The popover is a dialog named "Choose initiatives". It has one checkbox for each initiative of the meeting's project that is not deleted, including completed initiatives. It also has a checkbox for each deleted initiative that the meeting covers. The checkboxes are in one list, sorted by the shown name without regard to case, with no groups. The label of a checkbox is the shown name, with " (deleted)" after the name of a deleted initiative. A checkbox is checked when the meeting covers the initiative.

The roadmap groups of the select box are not kept. The user thinks of the initiatives of a meeting by name, and an alphabetical list is the fastest to scan.

- Checking a checkbox calls `add_meeting_initiative` at once. Unchecking one calls `remove_meeting_initiative` at once. The checkbox and the list in the row show the change at once, before the backend answers.
- If the backend refuses the change, the checkbox and the list go back to the saved state, and a failure toast says "Couldn't add the initiative. Try again." or "Couldn't remove the initiative. Try again."
- Each checkbox saves by itself. The user can check several initiatives quickly, and each change is saved without waiting for the others.
- When the removal of a deleted initiative is saved, its checkbox disappears from the popover, and its item disappears from the list, because the user cannot add a deleted initiative again.
- When the project has no initiatives and the meeting covers none, the popover says "This project has no initiatives."
- Escape, a click outside the popover, and a second click on "Choose" close the popover. The keyboard focus goes back to the "Choose" button.

The choices load again after an item is deleted or restored, as today, so that "Undo" in a delete toast updates an open popover. When the user changes the project of the meeting, the row starts again with no initiatives and the choices of the new project.

### Components

The popover and the checkbox come from the shadcn components `popover` and `checkbox`, which are already in `src/components/ui/` and are built on Base UI. A new component, `MeetingInitiativesPicker` in `src/features/meetings/`, replaces `MeetingInitiativeSelect`. It uses `useChoices` to load the initiatives, as the other rows of the sidebar do. The helpers in `src/lib/initiatives.ts` that group the choices by roadmap column are removed when no code uses them.

## Consequences

- The user sees every initiative of a meeting in the sidebar without opening anything.
- The height of the row grows with the number of initiatives that the meeting covers. A meeting usually covers a few, so the "Delete" button and the action items move down a little.
- The popover can be long in a project with many initiatives. It scrolls inside a height limit. A search field can be added later if the lists grow.
- Unchecking an initiative cannot be undone with a toast. Checking it again adds it back, unless it is deleted.
- The executable specs of Specs 0006 and 0008 that use the select box "Meeting initiative" now use the button, the popover, and the list. Spec 0009 lists the changes.

## Alternatives considered

- **A list with a remove button for each item, and a select box below it that adds an initiative.** It keeps the native select box, but the user changes one property with two different controls.
- **A checkbox for each initiative directly in the sidebar**, without a popover. It needs no click to open, but a project with many initiatives pushes the "Delete" button and the action items far down.
- **Groups by roadmap column in the popover**, as in the select box. The user asked for one alphabetical list.
- **A combobox with a search field**, such as shadcn's `command` component. It helps with very long lists, but it adds a dependency, and a project usually has a few initiatives.
