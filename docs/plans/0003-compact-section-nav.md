# Compact Navigation Between Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating sidebar with a narrow column of section icons that cannot be hidden, show each section's name in a tooltip, highlight the current section, and bring back the standard macOS title bar.

**Architecture:** The shadcn `Sidebar` is rendered with `collapsible="none"` and the icon width (ADR 0007). Each section is a `SidebarMenuButton` that renders a React Router `NavLink`, which sets `aria-current="page"` for its section and the pages inside it. The window drops its overlay title bar settings, so macOS draws a normal title bar above the web content.

**Tech Stack:** React 19, React Router 8 (`NavLink`), shadcn sidebar and tooltip on Base UI, `lucide-react` icons, Tailwind CSS v4, Tauri 2 configuration, Vitest with jsdom and with WebKit browser mode.

**Spec:** `docs/specs/0003-compact-section-nav.md`, with the executable specs `src/components/section-nav.spec.tsx` (jsdom) and `src/components/section-nav.browser.spec.tsx` (WebKit). Also read `docs/adrs/0007-use-narrow-icon-sidebar-and-native-title-bar.md`.

## Background for a new engineer

- The shell is in `src/App.tsx`: `SidebarProvider` holds `AppSidebar` (`src/components/app-sidebar.tsx`) and `SidebarInset`, the main area. Every page renders `PageHeader` (`src/components/page-header.tsx`) first.
- shadcn components are source files in `src/components/ui/` that we own and edit. `Sidebar` with `collapsible="none"` renders a plain `div` with the class `w-(--sidebar-width)`, which a `className` can override. `SidebarMenuButton` accepts `render` (the element to render, such as a link), `isActive`, and `tooltip`. It shows the tooltip only when the sidebar state is `"collapsed"`, unless the `tooltip` object passes `hidden: false`.
- Browser tests (`*.browser.spec.tsx`, `*.browser.test.tsx`) run in headless WebKit at 1200 by 800 pixels with the application's CSS. Install WebKit once with `bunx playwright install webkit`. Run one project with `bunx vitest run --project unit` or `--project browser`.
- Format with `bun run fmt` after each edit. Run `bun run check` before each commit; in every task, the only allowed failures are tests in the two `section-nav` spec files that a later task makes pass. Commits end with the line `Claude-Session: https://claude.ai/code/session_0114W1BsmzVkBVcip4pMbSik`.

## Global Constraints

- The section navigation is at most 49 pixels wide: `3rem` (the `--sidebar-width-icon` value, 48 pixels) plus a 1 pixel border on its right side.
- The Meetings section uses `NotebookPenIcon` from `lucide-react`, and its link's accessible name is "Meetings".
- There is no logo or application name in the section navigation.
- The navigation landmark keeps the label "Main". Spec 0001's executable spec finds the Meetings link inside it.
- The window keeps the title "gps", the default size of 1200 by 800 pixels, and the minimum size of 900 by 600 pixels.
- Do not change `docs/features`, merged ADRs, merged specs, or merged plans.
- Do not reference sections of an ADR or a plan in code comments.

## Review Focus

These cases are implied by the spec but not tested by the executable specs. Each one has a test in the task that owns the code.

1. The tooltip opens to the right of the icon and is fully inside the window. With the default side, above the icon, the tooltip of the top icon would be cut off by the top of the window. (Task 3)
2. The user can reach the Meetings link with the Tab key, as the first element that can take focus, and the link is inside the section navigation. Removing the page header's button must not leave the keyboard without a way to reach the navigation. (Task 2)
3. The name of the section is not visible in the column; only the icon is. If the hidden text is not hidden correctly, it widens or overflows the column. (Task 2)
4. The highlight of the current section is visible, not only reported to assistive technology. Nothing else checks that the styles follow `aria-current`. (Task 3)
5. When the pointer leaves the icon, the tooltip closes. (Task 3)

---

### Task 1: Use the standard macOS title bar

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src/components/page-header.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/App.test.tsx`
- Modify: `CLAUDE.md` (Architecture section, "Shell and routing" paragraph)
- Test: `src/components/section-nav.spec.tsx` (already written, do not change)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: no element carries `data-tauri-drag-region`, and the page header no longer adds `pl-24`. Task 2 changes the page header further.

- [ ] **Step 1: Run the title bar spec to see it fail**

Run: `bunx vitest run --project unit src/components/section-nav.spec.tsx -t "standard macOS title bar"`
Expected: FAIL with `expected { title: 'gps', … } to not have property "titleBarStyle"`.

- [ ] **Step 2: Remove the overlay title bar and the drag regions**

- In `tauri.conf.json`, remove `titleBarStyle`, `hiddenTitle`, and `trafficLightPosition` from the main window.
- In `capabilities/default.json`, remove `core:window:allow-start-dragging`.
- In `page-header.tsx`, remove `data-tauri-drag-region`, the `pl-24` class when the sidebar is closed, and the part of the docstring about the drag region and the window controls.
- In `app-sidebar.tsx`, remove `data-tauri-drag-region`, the `pt-9` class, and the comment about the window controls from `SidebarHeader`.
- In `App.test.tsx`, delete the tests "lets the user drag the window by the page header and the sidebar header" and "moves the page header clear of the window controls when the sidebar is hidden". Those tests check the overlay title bar, which this task removes.
- In `CLAUDE.md`, replace the sentences about the overlay title bar, `data-tauri-drag-region`, the start dragging permission, and the top left corner with one sentence: the window uses the standard macOS title bar, which is the only area that moves the window.

- [ ] **Step 3: Run the title bar spec and the check**

Run: `bunx vitest run --project unit src/components/section-nav.spec.tsx -t "standard macOS title bar"`
Expected: PASS.
Run: `bun run check`
Expected: the only failures are other tests in the two `section-nav` spec files.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json src/components/page-header.tsx src/components/app-sidebar.tsx src/App.test.tsx CLAUDE.md
git commit -m "Use the standard macOS title bar"
```

The commit message body explains that the two deleted `App.test.tsx` tests checked the overlay title bar.

---

### Task 2: Show the sections as a narrow column of icons that cannot be hidden

**Files:**
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/page-header.tsx`
- Modify: `src/components/ui/sidebar.tsx`
- Delete: `src/components/ui/sidebar.test.tsx`
- Modify: `src/features/meetings/meeting-editor.browser.test.tsx`
- Modify: `src/features/meetings/meetings-page.test.tsx`, `src/features/meetings/meeting-editor-page.test.tsx`
- Modify: `CLAUDE.md` (Architecture section, "Shell and routing" paragraph)
- Create: `src/components/app-sidebar.browser.test.tsx`
- Test: `src/components/section-nav.spec.tsx` and `src/components/section-nav.browser.spec.tsx` (already written, do not change)

**Interfaces:**
- Consumes: the page header and sidebar header from Task 1, without drag regions.
- Produces: `type Section = { title: string; path: string; icon: LucideIcon }` in `app-sidebar.tsx`, where `LucideIcon` is the type from `lucide-react`. `SECTIONS` is `[{ title: "Meetings", path: "/meetings", icon: NotebookPenIcon }]`. Each section is rendered by one `SidebarMenuButton` inside `<nav aria-label="Main">`, with the title in a `<span className="sr-only">`. Task 3 adds the tooltip and `NavLink` to that button.

- [ ] **Step 1: Run the specs of this task to see them fail**

Run: `bunx vitest run src/components/section-nav -t "as an icon|hides the navigation|width|Ctrl"`
Expected: FAIL in "shows each section as an icon", "has no button that shows or hides the navigation", "takes only as much width as its icons need", "keeps the same width at the minimum window size", and "stays in place when the user presses Ctrl+Cmd+S".

- [ ] **Step 2: Write the Review Focus tests in `src/components/app-sidebar.browser.test.tsx`**

Mock `@tauri-apps/api/core` so that `list_meetings` returns `[]`, as in `section-nav.browser.spec.tsx`. Render `<App />` and wait for "No meetings yet".

- `it("reaches the Meetings link first with the Tab key")`: after `await userEvent.tab()`, `document.activeElement` is the link named "Meetings" inside the navigation labeled "Main".
- `it("shows the icon and not the section name")`: inside the Meetings link, the `span` with the text "Meetings" has a `getBoundingClientRect().width` of at most 1, and the link's `scrollWidth` equals its `clientWidth`.

Run: `bunx vitest run --project browser src/components/app-sidebar.browser.test.tsx`
Expected: "shows the icon and not the section name" FAILS, because the text is visible. The Tab test may already pass.

- [ ] **Step 3: Make the sidebar a column of icons**

- In `app-sidebar.tsx`, give `Section` its `icon`. Render `<Sidebar collapsible="none" className="w-[calc(var(--sidebar-width-icon)+1px)] border-r">`. Remove `SidebarHeader` and the logo. Each `SidebarMenuButton` keeps `render={<Link to={section.path} />}` and `isActive={pathname.startsWith(section.path)}` for now, and its children are `<section.icon />` and `<span className="sr-only">{section.title}</span>`. Update the component docstring: a narrow column of section icons that is always shown.
- In `App.tsx`, remove the `style` with `--sidebar-width: 19rem` and the `CSSProperties` import.
- In `page-header.tsx`, remove `SidebarTrigger`, the `Separator` after it, `useSidebar`, the `cn` import if it is no longer used, and the mention of the button in the docstring.
- In `ui/sidebar.tsx`, remove the keyboard shortcut: the `SIDEBAR_KEYBOARD_SHORTCUT` constant and the `useEffect` that listens for `keydown`. Delete `ui/sidebar.test.tsx`, which tests only that shortcut.
- In `meeting-editor.browser.test.tsx`, delete the test "keeps the chrome in place when the sidebar is hidden", because the sidebar can no longer be hidden.
- In `meetings-page.test.tsx` and `meeting-editor-page.test.tsx`, remove the `SidebarProvider` wrapper, which `PageHeader` no longer needs.
- In `CLAUDE.md`, describe the shell as the narrow icon sidebar of ADR 0007 instead of the floating `sidebar-04` sidebar, and say that each section in `SECTIONS` has a title, a path, and an icon.

- [ ] **Step 4: Run the tests of this task**

Run: `bunx vitest run src/components/section-nav src/components/app-sidebar.browser.test.tsx`
Expected: every test PASSES except "shows the section's name when the pointer rests on its icon", "marks the current section on the Meetings page", and "marks the current section on a page inside it", which Task 3 makes pass.
Run: `bun run check`
Expected: the only failures are those three tests.

- [ ] **Step 5: Commit**

```bash
git add -A src CLAUDE.md
git commit -m "Show the sections as a narrow column of icons that cannot be hidden"
```

The commit message body explains why `ui/sidebar.test.tsx`, the browser test for a hidden sidebar, and the `SidebarProvider` wrappers were removed.

---

### Task 3: Name each section in a tooltip and mark the current section

**Files:**
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/components/app-sidebar.browser.test.tsx`
- Test: `src/components/section-nav.spec.tsx` (already written, do not change)

**Interfaces:**
- Consumes: `Section`, `SECTIONS`, and the `SidebarMenuButton` of each section from Task 2.
- Produces: `TooltipContent` renders its popup with `role="tooltip"`, for every tooltip in the application.

- [ ] **Step 1: Run the specs of this task to see them fail**

Run: `bunx vitest run --project unit src/components/section-nav.spec.tsx -t "pointer rests|current section"`
Expected: FAIL with `Unable to find role="tooltip"` and with a missing `aria-current` attribute.

- [ ] **Step 2: Add the Review Focus tests to `src/components/app-sidebar.browser.test.tsx`**

- `it("opens the tooltip to the right of the icon, inside the window")`: after `await userEvent.hover(meetingsLink)`, the element with the role `tooltip` has a `left` at least the link's `right`, a `top` of at least 0, and a `right` of at most `window.innerWidth`.
- `it("closes the tooltip when the pointer leaves the icon")`: after hovering the link and then `await userEvent.unhover(meetingsLink)`, `expect.poll` finds no element with the role `tooltip`.
- `it("highlights the current section")`: on the Meetings page, the computed `background-color` of the Meetings link differs from the computed `background-color` of the navigation labeled "Main".

Run: `bunx vitest run --project browser src/components/app-sidebar.browser.test.tsx`
Expected: the tooltip tests FAIL, because no tooltip opens, and the highlight test FAILS, because nothing is highlighted yet.

- [ ] **Step 3: Add the tooltip role, the tooltip, and `NavLink`**

- In `ui/tooltip.tsx`, pass `role="tooltip"` to `TooltipPrimitive.Popup` before `{...props}`, so that a caller can still override it. Base UI does not set a role on tooltips.
- In `app-sidebar.tsx`, render each button with `render={<NavLink to={section.path} />}` and `tooltip={{ children: section.title, hidden: false }}`, and remove `isActive` and `useLocation`. Style the highlight from the link's state with `aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground` on the button, which are the same colors that `data-active` uses.

If the jsdom test "shows the section's name when the pointer rests on its icon" still fails because Base UI does not open tooltips on the events that jsdom sends, and the browser tooltip tests pass, stop and report this. The fix is to move that spec to `section-nav.browser.spec.tsx`, which changes a spec file, so a human must agree to it first.

- [ ] **Step 4: Run the tests and the check**

Run: `bunx vitest run src/components/section-nav src/components/app-sidebar.browser.test.tsx`
Expected: PASS.
Run: `bun run check`
Expected: PASS, with no failures.

- [ ] **Step 5: Check the application by hand on macOS**

Run: `bun run tauri dev`
Expected: the title bar shows "gps", with the window controls in the title bar above the section navigation. Dragging the title bar moves the window. The Meetings icon is highlighted on the Meetings page and on a meeting's editor page, and resting the pointer on it shows "Meetings" to its right.

- [ ] **Step 6: Commit**

```bash
git add src/components/app-sidebar.tsx src/components/ui/tooltip.tsx src/components/app-sidebar.browser.test.tsx
git commit -m "Name each section in a tooltip and mark the current section"
```
