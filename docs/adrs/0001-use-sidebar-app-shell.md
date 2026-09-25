# 1. Use a floating sidebar as the application shell

Date: 2026-09-24

## Status

Proposed

## Context

Until now, the application has shown only the starter screen that Tauri generates for new projects. The first real feature, taking meeting notes, needs a permanent frame around the content: a place for navigation, a place for the current page, and a consistent header. Later features will add more sections to the application, so this frame must make room for them without a redesign.

The project uses shadcn for user interface components. shadcn is not a package that we import. Instead, its command line tool copies the source code of each component into `src/components/ui/`, where we own and edit it like any other code. shadcn also publishes "blocks", which are larger layouts built from its components. One of these, `sidebar-04`, is a sidebar that floats beside the page content with rounded corners, and it has a header, grouped navigation items, and optional submenus.

## Decision

We use the shadcn `sidebar-04` block as the application shell. The shell has two parts:

- The sidebar. Its header shows the application name. Below the header is a navigation group that lists the sections of the application. At first, the only section is "Meetings". The navigation is wrapped in a navigation landmark labeled "Main" so that assistive technology, and our tests, can find it.
- The main area, which shadcn calls the "inset". It has a header that contains a button to show or hide the sidebar and a breadcrumb trail that shows where the user is, such as `Meetings > Weekly sync`. The current page is shown below the header.

The sidebar is for navigation between sections of the application only. Content that belongs to a section, such as the list of meeting notes, is shown in the main area, not in the sidebar. This keeps the sidebar short and stable as the amount of content grows.

The default window size increases from 800 by 600 pixels to 1200 by 800 pixels, with a minimum size of 900 by 600 pixels. The sidebar is 19rem wide, and at the old size it left too little room for the note editor.

## Consequences

- Each new section of the application adds one item to the sidebar navigation and one route (see ADR 0002).
- We can change the style of the navigation, for example by adding submenus or icons, without changing the pages themselves.
- The block's code, and the `sidebar`, `breadcrumb`, and `separator` components that it uses, are copied into the project. We maintain that code from now on. Updates from shadcn are not applied automatically.

## Alternatives considered

- Show the list of notes inside the sidebar, as submenu items under "Meetings". This matches the block's sample content most closely, but the sidebar would grow with every note, and other sections would be pushed out of view.
- Use three columns: navigation, a list of notes, and the editor. Switching between notes is fast, but the layout is crowded at typical desktop window sizes, and not every future section will have a list and a detail view.
