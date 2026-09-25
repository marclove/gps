# Spec 0002: Scrollable editor with stationary chrome

Ticket: [0002 Scrollable editor with stationary chrome](../features/0002-scrollable-editor-with-chrome.md)

Executable spec: `src/features/meetings/scrolling.browser.spec.tsx`

## Summary

On the editor page, only the notes scroll. The page header, the meeting name, the meeting date, and the formatting toolbar stay at the top of the window, so the user can always see the name of the meeting and can format text anywhere in a long note. On the Meetings page, only the list of meetings scrolls. The window itself never scrolls.

## Terms

- **Chrome**: the parts of a page that are not its content, such as the page header, the title, and the formatting toolbar.
- **Page header**: the row at the top of the main area that contains the button that shows or hides the sidebar, the breadcrumb trail, and, on the editor page, the save status.
- **Notes area**: the part of the editor page, below the formatting toolbar, that contains the notes.

The terms "Meetings page" and "editor page" are defined in [Spec 0001](0001-take-meeting-notes.md).

## Behavior

The behavior below is described for a window of 1200 by 800 pixels, the default window size, with the sidebar visible.

### Editor page

- When the notes are taller than the notes area, the notes area scrolls. The page header, the meeting name field, the meeting date field, and the formatting toolbar do not move, and they stay fully visible.
- When the notes are shorter than the notes area, nothing scrolls, and the notes area still fills the space below the toolbar down to the bottom of the window. A click anywhere in the notes area puts the text cursor in the notes.
- When the user scrolls to the end of long notes, selects text there, and clicks a toolbar button, such as "Bold", the formatting is applied to that text.
- When the user types at the end of long notes, the notes area scrolls as needed so that the text cursor stays visible.

### Meetings page

- When the list of meetings is taller than the space below the title, the list scrolls. The page header, the "Meetings" title, and the "New note" button do not move, and they stay fully visible.

### Window

- On every page, the window itself does not scroll, whatever the length of the content.

## Backend contract

The executable spec uses the same commands as [Spec 0001](0001-take-meeting-notes.md), replaced by an in-memory fake. This feature adds no commands.

## Out of scope

- Remembering the scroll position of a note when the user leaves it and opens it again.
- Layout for windows smaller than the minimum window size of 900 by 600 pixels.
- Other pages. New pages decide which of their areas scroll when they are added (see ADR 0005).
