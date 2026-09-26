# 7. Use a narrow icon sidebar and the native title bar

Date: 2026-09-25

## Status

Accepted. Supersedes the floating sidebar of ADR 0001. The rest of ADR 0001 still applies: the sidebar is for navigation between sections only, and each section has one item in it.

## Context

ADR 0001 made the shadcn `sidebar-04` block the application shell. That block is a floating sidebar, 19rem (304 pixels) wide, that shows the name of each section as text. The page header has a button that shows or hides it, and the keyboard shortcut Ctrl+Cmd+S does the same.

Later, the window was changed to use an "overlay" title bar on macOS (pull request 4, which had no ADR). With an overlay title bar, the page content reaches the top of the window, and macOS draws the window controls, the red, yellow, and green buttons, on top of the content. To keep content out from under those controls, the sidebar header has extra space at the top, and the page header moves its content to the right when the sidebar is hidden. Because there is no title bar to drag, the page header and the sidebar header are marked as areas that move the window, which needs the Tauri permission `core:window:allow-start-dragging`.

Feature ticket 0003 asks for navigation that uses only as much width as its icons need, that cannot be hidden, and for the standard macOS title bar. Upcoming sections, such as a work tracker that shows tasks as cards in columns, need most of the width of the window. Each section will be shown as an icon, and its name appears when the pointer rests on the icon.

shadcn publishes another block, `sidebar-09`. Its first panel is a narrow column of icons, 3rem (48 pixels) wide, with a tooltip for each icon. Its second panel, which we do not need yet, shows a list for the current section.

## Decision

- The sidebar is a narrow column of icons, like the first panel of `sidebar-09`. We use the shadcn `Sidebar` component with `collapsible="none"`, so that it is always shown and has no collapsed state. It is `3rem` wide (the `--sidebar-width-icon` value) plus a 1 pixel border on its right side. It does not float, and the main area starts right after its border.
- The column contains only the navigation landmark labeled "Main". There is no application name or logo, because the title bar shows the name of the application.
- Each section in `SECTIONS` in `app-sidebar.tsx` has a title, a path, and an icon from `lucide-react`. The Meetings section uses `NotebookPenIcon`. Each item is a `SidebarMenuButton` that renders a React Router `NavLink`. The title is in the link as text that only assistive technology reads, so the link's accessible name is the name of the section. A tooltip shows the title when the pointer rests on the icon.
- `NavLink` marks its link with `aria-current="page"` when the current route is its path or a route inside it, such as `/meetings/3` for `/meetings`. The highlight of the current section is styled from that state, so the highlight and what assistive technology reports cannot disagree.
- The tooltip popup (`TooltipContent` in `src/components/ui/tooltip.tsx`) gets the accessible role `tooltip`. The Base UI library under shadcn does not set a role on tooltips, and without one, assistive technology and our tests cannot identify a tooltip.
- The sidebar cannot be hidden. The page header no longer has a button to show or hide it, and the keyboard shortcut Ctrl+Cmd+S is removed from `SidebarProvider`. `SidebarProvider` stays, because the shadcn sidebar components read their settings from it.
- The window uses the standard macOS title bar, above the content. The settings `hiddenTitle` and `trafficLightPosition` are removed from `tauri.conf.json`, so the title bar shows the window title, "gps", and the window controls sit in the title bar.
- The title bar has the color of the border at the right side of the section column, `#e5e5e5` (the `--sidebar-border` value in `src/index.css`). A standard title bar is drawn by macOS in its own color, which looks white next to the column. To color it, the window uses `titleBarStyle: "Transparent"`, which keeps the title bar in its normal place above the content but draws it without a background, so the window's `backgroundColor` shows through. Unlike the overlay title bar, the content does not go under it.
- The window uses the light appearance (`theme: "Light"`). The application has only light colors, and in the dark appearance macOS would draw the title in white on the light gray title bar.
- Only the title bar moves the window, as in other Mac applications. The `data-tauri-drag-region` attributes and the `core:window:allow-start-dragging` permission are removed.

## Consequences

- The main area gains about 256 pixels of width at every window size.
- The page header and the sidebar no longer need extra space for the window controls, and the page header no longer changes its layout depending on the sidebar.
- The title bar color is written twice: as `backgroundColor` in `tauri.conf.json` and as `--sidebar-border` in `src/index.css`. A browser spec checks that they are the same.
- The web view also gets the `backgroundColor`, so the window can show gray for a moment while the page loads, before the page paints its own background.
- The content area is shorter by the height of the title bar, about 28 pixels. Pages already fit their content into the height that they have (see ADR 0005), so no page needs to change for this.
- A section's name is not visible until the pointer rests on its icon. Icons must be distinct enough to recognize after the user has learned them.
- The `SidebarTrigger` and `SidebarRail` components stay in the generated file `src/components/ui/sidebar.tsx` but are not used.
- If a section later needs a list beside the icons, the second panel of `sidebar-09` can be added next to the column without changing the column.
- Navigation between the views of one section is not part of the sidebar. Most sections are expected to use a segmented control in their page header, which each section decides for itself.

## Alternatives considered

- Build a custom column of icons with `NavLink` and `Tooltip`, without the shadcn sidebar components. It needs less code now, but it no longer matches `sidebar-09`, and the second panel would have to be built from nothing if we need it.
- Use `collapsible="icon"` and keep the sidebar collapsed all the time. This is the markup of `sidebar-09`, but the code to expand and collapse the sidebar, its transitions, and its keyboard shortcut stay active for a sidebar that must never expand.
- Keep the overlay title bar and make the page header and the sidebar leave room for the window controls. This saves the height of the title bar, but the ticket asks for the standard title bar, and every page header would have to keep content out of the top left corner.
