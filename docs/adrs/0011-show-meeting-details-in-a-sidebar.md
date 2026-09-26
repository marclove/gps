# 11. Show the details of a meeting in a sidebar on its editor page

Date: 2026-09-26

## Status

Accepted

## Context

The editor page of a meeting shows the meeting's name, date, and notes. Until now, the date was on the same row as the name, and the button that archives the meeting was in the page header, next to the save status.

Feature ticket 0005 adds a list of action items to the editor page, in a column at the right side of the page. While we designed that column, we decided that it should not belong to action items only. It is a place for everything about the meeting that is not the notes themselves: its properties, the actions on the meeting as a whole, and lists that belong to the meeting, such as its action items. Later features will probably add more properties, such as attendees or a location.

We had to decide what goes into this column, how it is arranged, and how it fits into the page layout of ADR 0005.

## Decision

- The editor page has two columns. The left column holds the page header, the meeting name, and the notes editor. The right column is a sidebar whose width follows the width of the window: `clamp(18rem, calc(11rem + 11vw), 24rem)`. It is 18rem (288 pixels) wide in windows up to about 1020 pixels wide, grows by about 11 pixels for each 100 pixels of window width above that, and stops at 24rem (384 pixels). In a full-screen window on a laptop, the extra width gives the date and the action items more room, and in a narrow window the notes keep their width. The sidebar is a landmark (`<aside>`) with the accessible name "Meeting details".
- The sidebar is as tall as the main area of the window. It starts at the top of the main area, beside the page header, not below it. A border separates it from the left column.
- The meeting name stays in the left column, above the notes, because it is the title of the page.
- The sidebar has these parts, from top to bottom:
  1. The properties of the meeting, one labeled row for each property. Today the only property is the date, in a row with the label "Date".
  2. The actions on the whole meeting. Today the only action is the "Archive" button.
  3. A separator.
  4. Lists that belong to the meeting. Today the only list is the action items, in a region named "Action items".
- A new property of a meeting goes into part 1 as another labeled row. A new action on the whole meeting goes into part 2. A new list that belongs to the meeting goes into part 4, as its own region with a heading.
- Parts 1 and 2 stay in place. Each list decides which of its areas scroll, as ADR 0005 describes. Today the list of action items scrolls, and its heading and its "Add action item" field stay in place.
- The page header of the editor page keeps the breadcrumb trail and the save status.

## Consequences

- The notes get the full width of the left column, apart from the width of the sidebar.
- The Archive button is no longer in the page header. Spec 0004 describes it in the page header, and spec 0005 records the change, because a spec that has been merged is not changed.
- The date field is no longer on the row of the meeting name. Its accessible name stays "Meeting date", which contains its visible label "Date".
- The width of the window is at least 900 pixels, so the left column is at least about 560 pixels wide. If the sidebar gets many more parts, it may need a way to be hidden or resized. That is left to a later decision.
- Other pages that show one item, such as a page for one task later, can use the same arrangement.

## Alternatives considered

- A sidebar below the page header. The header would then span both columns. We chose the full height so that the sidebar reads as a separate view of the meeting beside the whole page, and so that it has more height for its lists.
- A column for action items only, with the date and the Archive button left where they were. This gives no place for later properties of a meeting, and the user asked for the column to be a view of the meeting.
- Put the meeting name in the sidebar too. The name is the title of the page, and users look for a title at the top of the main content.
