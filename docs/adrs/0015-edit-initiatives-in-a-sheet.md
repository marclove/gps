# 15. Edit initiatives in a sheet over the roadmap

Date: 2026-09-26

## Status

Accepted

## Context

Feature ticket 0006 shows initiatives as cards on a roadmap (ADR 0013), and asks for an initiative to be edited in a shadcn Sheet. A sheet is a panel that slides in from one side of the window, over the page. It is a modal dialog: while it is open, the page behind it is dimmed and does not take input. The project already has the shadcn `Sheet` component in `src/components/ui/sheet.tsx`, built on the Base UI dialog.

Meetings are edited on their own page, with a route such as `/meetings/3`, a page header with a breadcrumb trail, and a sidebar with the properties of the meeting (ADR 0011). Their name, date, and notes are saved automatically while the user types, and a save status shows "Saving…", "Saved", or "Couldn't save" with a "Retry" button.

We had to decide:

- whether the open sheet has its own route,
- what the sheet contains and how it is arranged,
- how changes are saved, and how the board learns about them,
- how deleting from the sheet works.

## Decision

### State, not a route

The Initiatives page keeps the identifier of the open initiative in its own state. Opening a sheet does not change the route, which stays `/initiatives`, and the breadcrumb trail stays "Initiatives". The application uses a `MemoryRouter` with no address bar (ADR 0002), so a route would give no link to share or bookmark. It would only make the sheet close and open again when the user goes back.

When the sheet closes, keyboard focus goes back to the card that opened it, as Base UI does for any dialog. After a delete, the card is gone, so focus goes to the "New initiative" button instead.

### Contents

The sheet opens from the right side, is 40rem wide or the width of the window if that is less, and is as tall as the window. Its accessible name is the name of the initiative, or "Untitled initiative" when the name is empty. From top to bottom, it has:

1. The name field, labeled "Initiative name", with the save status next to it.
2. A select box labeled "RACI role", with an empty choice for no role, and "Responsible", "Accountable", "Consulted", and "Informed".
3. For a completed initiative only, the text "Completed on" and the date of completion, such as "Completed on September 26, 2026".
4. The description, in the Markdown editor with its formatting toolbar, labeled "Description".
5. A "Delete" button.

The button that closes the sheet is the one that the shadcn `SheetContent` puts at the top right corner. It is last in the order of the keyboard focus, after "Delete". Many dialogs put their close button there, and using the component as it is keeps the code smaller. The Escape key also closes the sheet.

Parts 1, 2, 3, 5, and the toolbar stay in place. Only the text of the description scrolls, in a grid row sized `minmax(0,1fr)`, as ADR 0005 describes for pages.

There is no button to complete or reopen an initiative. Dragging a card, with the pointer or with the keyboard (ADR 0014), is the one way to change its column.

### Saving

- The name, the role, and the description are saved automatically with `useAutosave`, with the same delay as the meeting editor. The name is saved through `rename_initiative`, and the role and the description through `update_initiative` (ADR 0013). The save status is the same component as on the meeting editor page, with the same "Retry" button.
- Names are unique (ADR 0013). When `rename_initiative` answers that another initiative has the name, the name field is marked as invalid, and a message below it says `Another initiative is named "<name>".` The name stays as it was saved last, and the card and the title of the sheet keep that name. The role and the description are still saved. This is not a failure to save, so the save status does not say "Couldn't save". The message goes away when the user changes the name to one that can be saved, or to the name that is saved now.
- While the user types, the name passes through shorter names, such as "Launch" on the way to "Launch v2". If one of them is taken, the message shows only until the next save, after the user pauses.
- If the sheet closes while the message is shown, the name that conflicts is not saved.
- Closing the sheet saves a change that is not yet saved, in the same way as leaving the meeting editor page does.
- The sheet loads the full initiative with `get_initiative` each time it opens, because the board has only summaries without descriptions. While it loads, the fields are disabled. If it cannot load, the sheet says "Couldn't load the initiative" with a "Retry" button.
- After each save that succeeds, the sheet gives the saved initiative to the board, which updates the name and the role on the card. The board does not load the whole list again, so a save cannot move a card that the user is dragging.

### Deleting

- The "Delete" button calls the shared archive action (ADR 0016) with the kind "initiative". The sheet saves any pending change first, then the initiative is archived, the sheet closes, the card is removed, and the archive toast says `Deleted "<name>".` with an "Undo" button.
- "Undo" restores the initiative to the place it had (ADR 0013). If the Initiatives page is open, the board loads again and keyboard focus moves to the restored card.
- If another initiative has the same name by then, the initiative stays deleted, and the toast says `Couldn't restore "<name>" because another initiative has that name.`, with no "Undo" button, because trying again cannot succeed.
- If the delete fails, the sheet stays open and a failure toast says "Couldn't delete the initiative. Try again." (ADR 0012).

## Consequences

- The user edits an initiative without leaving the board, and sees the card change when the sheet closes.
- The sheet has less room than an editor page. A long description scrolls inside the sheet. If initiatives later need lists of their own, such as their meetings, the sheet may need to become a page, and that change needs its own decision.
- A sheet is a new place for automatic saving. The meeting editor saves when its page closes. The sheet saves when it closes, and both use the same hook.
- The user interface says "Delete" while the code and the database say "archive". Tests and messages that the user sees use "Delete". Names in the code use "archive".

## Alternatives considered

- **A dialog in the middle of the window.** It covers the board and has a fixed height, which leaves less room for a long description than a sheet as tall as the window.
- **A route for each open sheet**, such as `/initiatives/3`. It gives nothing without an address bar, and it couples the sheet to navigation, so going back would open and close sheets.
- **Save and Cancel buttons.** The user chose automatic saving, as for meetings, so the two editors behave the same way.
- **Complete and Reopen buttons in the sheet.** They would be a second way to do what dragging does. Keyboard dragging already makes the columns reachable without a pointer.
