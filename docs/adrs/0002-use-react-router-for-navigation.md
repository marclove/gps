# 2. Use React Router with in-memory history for navigation

Date: 2026-09-24

## Status

Proposed

## Context

The application now has more than one page. For meeting notes alone, there is a page that lists the notes and a page that edits one note. More sections will be added to the sidebar over time (see ADR 0001). The application needs a consistent way to decide which page to show, to move between pages, to go back, and to build the breadcrumb trail in the header.

In a web browser, this is usually handled by a "router": a library that maps an address, such as `/meetings/3`, to a page, and keeps that address in the browser's address bar. A Tauri desktop window has no address bar. The user cannot type an address or bookmark one. Also, in a release build, Tauri serves the frontend files through its own protocol, and a router that relies on the browser's address could ask Tauri for a path that does not exist as a file.

## Decision

We use React Router, version 8, through its component interface: a `MemoryRouter` that contains `Routes` and `Route` elements. A memory router keeps the history of visited pages in memory instead of in the browser's address, so it does not depend on how Tauri serves files.

The routes are:

- `/`, which redirects to `/meetings`.
- `/meetings`, which shows the list of meeting notes.
- `/meetings/:id`, which shows the editor for the meeting with that identifier.

Pages link to each other with React Router's `Link` component and move programmatically with its `useNavigate` hook. The application always starts at `/`.

## Consequences

- Moving between pages, going back, and reading the identifier from the route all use one well-documented library.
- Because the application always starts at `/`, feature specs start there too and reach other pages by clicking, as a user would.
- The application does not remember which page was open when it was last closed. If we want that later, we can store the last route and pass it to the memory router as its starting point.

## Alternatives considered

- TanStack Router. It checks route paths and parameters at compile time, which React Router does not do as thoroughly. It needs more setup, either a route tree written by hand or code generation through a Vite plugin, and it is less familiar to most React developers. With only a few routes, the extra type safety does not justify the setup.
- No router, with a React state variable that decides which page to show. This is the simplest option for two pages, but going back, links between pages, and breadcrumbs would all be built by hand, and it would have to be replaced as sections are added.
- React Router with browser history or hash history. Both keep the route in an address that the user of a desktop window cannot see. Browser history also risks broken paths in release builds, as described above.
