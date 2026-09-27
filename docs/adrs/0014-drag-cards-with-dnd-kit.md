# 14. Drag the cards of the roadmap with dnd-kit

Date: 2026-09-26

## Status

Accepted

## Context

Feature ticket 0006 shows initiatives as cards on a roadmap with the columns Now, Next, Later, and Done (ADR 0013). The user drags a card to another column or to another place in the same column. Dropping a card in Done completes the initiative, and dragging it out of Done reopens it.

Dragging must also work without a pointer. A user who works with the keyboard, or with a screen reader, must be able to move a card and to hear where it is.

There are two ways to build dragging in a web page:

- **The native drag and drop of HTML.** The browser sends `dragstart`, `dragover`, and `drop` events. Tauri also uses these events on the window to receive files that are dropped from the operating system. Tauri's `dragDropEnabled` window setting must be turned off before the page receives them, and then the application can no longer receive dropped files.
- **Pointer events.** A library listens to `pointerdown`, `pointermove`, and `pointerup`, and moves the card itself. This does not conflict with Tauri.

We compared three React libraries:

- `@dnd-kit/core` with `@dnd-kit/sortable` (versions 6 and 10), which use pointer events and include a keyboard sensor and messages for screen readers. Several sortable columns are a documented use.
- `@dnd-kit/react` (version 0.5), a newer rewrite by the same author. Its version number is below 1, so its interface can change in any release.
- `@atlaskit/pragmatic-drag-and-drop` (version 4), which uses the native drag and drop of HTML and has no keyboard support.

The project checks layout and pointer behavior in headless WebKit (ADR 0006). jsdom has no layout, so it cannot run a drag. Before this decision, a short experiment outside the branch checked that the browser tests can drive `@dnd-kit/core` with the pointer and with the keyboard.

## Decision

We use `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities`.

### Board

- One `DndContext` holds the four columns. Each column is a `SortableContext` with a vertical list, and each card uses `useSortable`. The whole list area of a column, also when it is empty, is a place to drop.
- The pointer sensor starts a drag only after the pointer moves 8 pixels, so a click on a card opens its sheet.
- The keyboard sensor starts and ends a drag with Space only, and cancels with Escape. Enter stays free to open the sheet. The Up and Down arrow keys move the card in its column, and the Left and Right arrow keys move it to the next column. The cards fill the width of their list, because the standard keyboard coordinates of dnd-kit compare left edges, and a card narrower than its list would not reach the next column.
- While a card moves over another column, the board moves it into that column in its own state, as the "multiple containers" example of dnd-kit does, so that the other cards make room.
- Done does not take part in sorting. A card over Done shows at its top. A drag inside Done changes nothing.

### Saving a drop

- When the card drops, the board keeps the new order in its state at once, and calls `move_initiative` with the column and the index where the card dropped. The frontend computes no positions. The backend renumbers the columns (ADR 0013).
- If `move_initiative` fails, the board puts back the order from before the drag and shows a failure toast, "Couldn't move the initiative. Try again." (ADR 0012).
- The board does not load the list again after a move that succeeds, because its state already matches the backend.

### Messages for screen readers

The board gives dnd-kit its own messages, in the words of the roadmap:

- `Picked up <name>.`
- `<name> is in <column>, position <n> of <count>.`
- `<name> was moved to <column>, position <n> of <count>.`
- `<name> was completed.`
- `<name> was put back.`

dnd-kit asks for a message before the board updates its state for a drop. So a message reads the column and the index from the event's `over` target, which dnd-kit fills in, and not from the board's state.

### Tests

- Dragging is tested in the WebKit browser project with `userEvent.dragAndDrop(source, target, { steps: 10 })` from `vitest/browser`. Without the steps, the pointer jumps to the target in one move, and dnd-kit never sees it pass over another card. For the keyboard, the test focuses a card and sends Space, arrow keys, and Space with `userEvent.keyboard`.
- After a drag ends, dnd-kit ignores clicks for about 50 milliseconds, so that the end of a drag does not count as a click. A test that clicks right after a drag must wait for that time.
- The jsdom tests render the board and use clicks and Enter, but do not drag.

## Consequences

- The application keeps the ability to receive files dropped on the window, because the board does not use the native drag and drop of HTML.
- Keyboard and screen reader users can reorder and complete initiatives, which is why the sheet has no buttons to complete or reopen.
- `@dnd-kit/core` has had no release since December 2024. It works with React 19 without warnings, and it is small enough that we could replace it. If it stops working with a later React version, `@dnd-kit/react` is the likely replacement, once it reaches version 1.
- Three new dependencies are added to `package.json`.

## Alternatives considered

- **`@dnd-kit/react`.** Its interface is simpler, and it is in active development. But an interface below version 1 can change in any release, and every change would touch the board and its tests.
- **`@atlaskit/pragmatic-drag-and-drop`.** It is maintained and small, but it needs `dragDropEnabled` turned off in Tauri, and we would build the keyboard support and the messages for screen readers ourselves.
- **No library.** Pointer tracking, automatic scrolling while dragging, keyboard moves, and messages for screen readers are a large amount of code to write and maintain.
