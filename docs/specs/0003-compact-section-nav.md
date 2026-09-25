# Spec 0003: Compact navigation between sections

Ticket: [0003 Compact navigation between sections](../features/0003-compact-section-nav.md)

Executable specs: `src/components/section-nav.spec.tsx` and `src/components/section-nav.browser.spec.tsx`

## Summary

The navigation between sections is a narrow column of icons at the left side of the window. It cannot be hidden. Each section is one icon, the name of the section appears when the pointer rests on its icon, and the icon of the current section is highlighted. The window has the standard macOS title bar, so the window controls do not cover any part of the application.

## Terms

- **Section**: a major part of the application, such as Meetings. For now, Meetings is the only section.
- **Section navigation**: the column of section icons at the left side of the window. It is labeled "Main" for assistive technology.
- **Page header**: the row at the top of the main area that contains the breadcrumb trail.

The terms "Meetings page" and "editor page" are defined in [Spec 0001](0001-take-meeting-notes.md).

## Behavior

The behavior below is described for a window of 1200 by 800 pixels, the default window size, unless it names another size.

### Section navigation

- The section navigation is at the left side of the window, from the top of the window content to the bottom. It is at most 49 pixels wide: 48 pixels for the icons and a 1 pixel border. The main area starts at its right edge.
- The section navigation has the same width at the minimum window size of 900 by 600 pixels.
- Each section is a link that shows an icon and no visible text. The Meetings section is a link named "Meetings" for assistive technology.
- When the pointer rests on a section's icon, a tooltip shows the name of the section, such as "Meetings".
- A click on a section's icon opens that section's first page, such as the Meetings page. The executable spec of [Spec 0001](0001-take-meeting-notes.md) already checks this for Meetings.

### Current section

- The link of the current section is marked as the current page (`aria-current="page"`) and is highlighted.
- This is also true on pages inside the section. On the editor page of a meeting, the Meetings link is marked as the current page and highlighted.

### No hiding

- There is no button that shows or hides the section navigation, in the page header or anywhere else.
- The keyboard shortcut Ctrl+Cmd+S does not hide the section navigation or change the layout.

### Window

- The window uses the standard macOS title bar. It shows the title "gps", and the window controls are in the title bar, not on top of the application's content. In `src-tauri/tauri.conf.json`, the main window has none of the settings `titleBarStyle`, `hiddenTitle`, or `trafficLightPosition`.

This replaces the parts of [Spec 0001](0001-take-meeting-notes.md) and [Spec 0002](0002-scrollable-editor-with-chrome.md) that describe a sidebar the user can hide and a button in the page header that shows or hides it.

## Manual verification

The executable specs check the window settings, but not how macOS draws the window. Run `bun run tauri dev` on macOS and check that the title bar shows "gps", that the window controls are in the title bar above the section navigation, and that dragging the title bar moves the window.

## Backend contract

The executable specs use the meeting commands of [Spec 0001](0001-take-meeting-notes.md), replaced by an in-memory fake. This feature adds no commands.

## Out of scope

- Sections other than Meetings. Each new section adds its own icon when it arrives.
- Navigation between the views of one section, such as a segmented control in the page header.
- A second panel beside the icons that lists the content of the current section.
- Keyboard shortcuts for moving between sections.
