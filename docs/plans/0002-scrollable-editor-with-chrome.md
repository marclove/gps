# Scrollable Editor with Stationary Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Only the content areas of a page scroll. On the editor page, the page header, the meeting name, the meeting date, and the formatting toolbar stay at the top of the window while the notes scroll. On the Meetings page, the header and the title stay while the list scrolls.

**Architecture:** The application shell becomes exactly as tall as the window, so the window itself never scrolls (ADR 0005). Each page is a CSS grid whose last row takes the remaining height, and the areas that scroll are grid cells with `min-height: 0` and `overflow-y: auto`. The notes editor is a grid of two rows, its toolbar and its scrolling notes, and the editor page puts the whole editor in its last row.

**Tech Stack:** React 19, Tailwind CSS v4, TipTap 3, Base UI Popover, Vitest browser mode with Playwright WebKit (ADR 0006).

**Spec:** `docs/specs/0002-scrollable-editor-with-chrome.md`, with the executable spec `src/features/meetings/scrolling.browser.spec.tsx`. Also read `docs/adrs/0005-pages-fill-the-window-and-scroll-their-own-areas.md` and `docs/adrs/0006-run-layout-specs-in-a-real-browser.md`.

## Background for a new engineer

- The shell is shadcn's sidebar. `SidebarProvider` (in `src/components/ui/sidebar.tsx`) renders a flex row that holds the sidebar and `SidebarInset`, the main area. `SidebarInset` is a flex column. Each page renders `PageHeader` first and then its content, as children of `SidebarInset`.
- A grid row or flex item grows to the height of its content unless it has `min-height: 0` (`min-h-0`), and a grid row of `1fr` has a minimum of `auto`. Use `minmax(0,1fr)` for a row that must not grow past its space. Without these, nothing scrolls, because the content makes its box taller instead.
- jsdom does not calculate layout, so layout tests are browser tests in files named `*.browser.spec.tsx` (feature specs) or `*.browser.test.tsx` (unit tests, added in Task 2). They run in headless WebKit at 1200 by 800 pixels with the application's CSS. `userEvent` from `vitest/browser` sends real mouse and keyboard input through Playwright.
- Install WebKit once with `bunx playwright install webkit`. Run only the browser tests with `bunx vitest run --project browser`, and only the jsdom tests with `bunx vitest run --project unit`.
- If a browser test fails to import with "Importing a module script failed" after dependencies change, delete `node_modules/.vite` and run it again. Vite keeps a cache of prebuilt dependencies there.
- Format with `bun run fmt` after each edit. Commits end with the line `Claude-Session: https://claude.ai/code/session_016FgrFQoMuSV8Qk9UwhYj32`.

## Global Constraints

- The window itself never scrolls, on any page.
- Scrolling areas use native scrolling (`overflow-y-auto` on an ordinary element), not shadcn's `ScrollArea`.
- Do not add a shared page layout component, a set of named grid areas for all pages, or a scrolling area component.
- The meeting name on the editor page and the "Meetings" title on the Meetings page keep the same size and position (Spec 0001).
- The default window size is 1200 by 800 pixels, and the minimum is 900 by 600 pixels.
- Do not change `docs/features`, merged ADRs, merged specs, or merged plans. ADR 0006 is not merged yet, and Task 2 changes it.
- Do not reference sections of an ADR or a plan in code comments.

## Review Focus

These cases are implied by the spec but not tested by the executable spec. Each one has a test in the task that owns the code.

1. At the minimum window size of 900 by 600 pixels, the chrome stays visible and the notes scroll. (Task 2)
2. When the sidebar is hidden, the chrome stays in place while the notes scroll. (Task 2)
3. When the user scrolls one meeting's notes and then opens another meeting, the other meeting's notes start at the top. (Task 2)
4. A long word without spaces, such as a pasted address, wraps inside the notes instead of making the page scroll sideways. A spike showed that it does not: the editor is a flex item, whose minimum width is the width of its longest word. (Task 2)
5. When the link popover is open and the user scrolls the notes, the popover stays next to its text. A spike showed that it does not: the popover is anchored to a virtual element, and the positioning library then listens only for scrolling of the window. (Task 3)

---

### Task 1: Fix the shell to the window height and scroll the Meetings list

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/meetings/meetings-page.tsx`
- Modify: `CLAUDE.md` (Architecture section)
- Test: `src/features/meetings/scrolling.browser.spec.tsx` (already written, do not change)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `SidebarProvider` with the height of the window and `SidebarInset` with `min-h-0`. A page that is a grid with `min-h-0 flex-1` fills the main area exactly. Task 2 relies on this.

This task does not add `overflow-hidden` to `SidebarInset`. The editor page is not a grid until Task 2, and with `overflow-hidden` its long notes would be cut off with no way to scroll to them.

- [ ] **Step 1: Run the Meetings page spec to see it fail**

Run: `bunx vitest run --project browser -t "scrolls the list"`
Expected: FAIL. The positions of the header, the title, and the "New note" button are about 1950 pixels above the top of the window, because the window scrolled.

- [ ] **Step 2: Make the shell as tall as the window**

In `src/App.tsx`, change the `SidebarProvider` and `SidebarInset` elements:

```tsx
                <SidebarProvider
                    className="h-svh"
                    style={{ "--sidebar-width": "19rem" } as CSSProperties}
                >
                    <AppSidebar />
                    <SidebarInset className="min-h-0">
```

- [ ] **Step 3: Make the Meetings page a grid with a scrolling list**

In `src/features/meetings/meetings-page.tsx`, replace the returned JSX of `MeetingsPage` with this. The title and the error about creating a note are chrome. The loading message, the error about loading, the empty message, and the list are in the scrolling area.

```tsx
    return (
        // The header and the title stay in place, and the last row, which gets the
        // remaining height, scrolls.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)]">
            <PageHeader crumbs={[{ label: "Meetings" }]}>
                <Button onClick={createNote} disabled={creating}>
                    <PlusIcon />
                    New note
                </Button>
            </PageHeader>
            <div className="flex flex-col gap-4 px-4 pb-4">
                <h1 className={PAGE_TITLE_CLASSES}>Meetings</h1>
                {createFailed && (
                    <p role="alert" className="text-sm text-destructive">
                        Couldn't create a note. Try again.
                    </p>
                )}
            </div>
            <div className="overflow-y-auto px-4 pb-4">
                {list.kind === "loading" && (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                )}
                {list.kind === "error" && (
                    <div className="flex items-center gap-2 text-sm">
                        <p>Couldn't load meetings</p>
                        <Button variant="outline" size="sm" onClick={retry}>
                            Retry
                        </Button>
                    </div>
                )}
                {list.kind === "loaded" && list.meetings.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        No meetings yet
                    </p>
                )}
                {list.kind === "loaded" && list.meetings.length > 0 && (
                    <ul className="flex flex-col gap-1">
                        {list.meetings.map((meeting) => (
                            <li key={meeting.id}>
                                <Link
                                    to={`/meetings/${meeting.id}`}
                                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted"
                                >
                                    <span className="font-medium">
                                        {displayName(meeting.name)}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {formatMeetingDate(meeting.date)}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
```

- [ ] **Step 4: Run the Meetings page spec to see it pass**

Run: `bunx vitest run --project browser -t "scrolls the list"`
Expected: PASS. The four editor page specs still fail, which is expected until Task 2.

- [ ] **Step 5: Run the jsdom tests**

Run: `bunx vitest run --project unit`
Expected: all 64 tests pass.

- [ ] **Step 6: Document the shell rule in CLAUDE.md**

In `CLAUDE.md`, in the **Shell and routing** item of the Architecture section, after the sentence that ends "with its breadcrumb trail.", add:

```markdown
The shell is exactly as tall as the window, and the window never scrolls. Each page fills the main area, lays out its areas with CSS grid, and decides which areas scroll: a scrolling area is a grid cell with `min-h-0` and `overflow-y-auto`, in a row sized `minmax(0,1fr)` (see ADR 0005).
```

- [ ] **Step 7: Commit**

```bash
bun run fmt
git add src/App.tsx src/features/meetings/meetings-page.tsx CLAUDE.md
git commit -m "Fix the shell to the window height and scroll the Meetings list

Claude-Session: https://claude.ai/code/session_016FgrFQoMuSV8Qk9UwhYj32"
```

### Task 2: Scroll the notes below the editor chrome

**Files:**
- Modify: `vitest.config.ts`
- Modify: `docs/adrs/0006-run-layout-specs-in-a-real-browser.md` (not merged yet)
- Modify: `CLAUDE.md` (Testing conventions section)
- Modify: `src/App.tsx`
- Modify: `src/features/meetings/meeting-editor.tsx`
- Modify: `src/features/meetings/notes-editor.tsx`
- Create: `src/features/meetings/meeting-editor.browser.test.tsx`
- Test: `src/features/meetings/scrolling.browser.spec.tsx` (already written, do not change)

**Interfaces:**
- Consumes: from Task 1, a shell of the window's height, in which a grid with `min-h-0 flex-1` fills the main area.
- Produces: `NotesEditor` fills the height of its container. The toolbar stays at the top, and the notes scroll below it. Its props do not change: `{ initialMarkdown: string; onChange: (markdown: string) => void }`. Task 3 relies on the notes being inside a scrolling element.

- [ ] **Step 1: Let the browser project run browser unit tests**

Tests for Review Focus cases 1 to 5 are unit tests, not feature specs, so they go in a `*.browser.test.tsx` file. In `vitest.config.ts`, change the comment and the patterns:

```ts
// Two projects: `unit` runs in jsdom, and `browser` runs the `*.browser.spec.tsx` and
// `*.browser.test.tsx` files in a real WebKit engine, because jsdom does not
// calculate layout.
```

In the `unit` project: `exclude: ["src/**/*.browser.{test,spec}.tsx"],`
In the `browser` project: `include: ["src/**/*.browser.{test,spec}.tsx"],`

In `docs/adrs/0006-run-layout-specs-in-a-real-browser.md`, replace the second and third items of the Decision list with:

```markdown
- Feature specs that run in the browser are named `*.browser.spec.tsx`, and unit tests that run in the browser are named `*.browser.test.tsx`. They load the application's CSS (`src/index.css`) and replace the Tauri backend with a fake through `vi.mock`, like the jsdom tests.
- The Vitest configuration has two projects. The `unit` project runs all other `*.test.*` and `*.spec.*` files in jsdom, as before. The `browser` project runs only the `*.browser.spec.tsx` and `*.browser.test.tsx` files in WebKit. `bun run test` runs both projects.
```

and in the fourth item, change "We write browser specs only for" to "We write browser tests only for".

In `CLAUDE.md`, in the Testing conventions item that starts "Behavior that depends on layout", change "Test it in a browser spec named `*.browser.spec.tsx`, which" to "Test it in a browser feature spec named `*.browser.spec.tsx` or a browser unit test named `*.browser.test.tsx`, which".

- [ ] **Step 2: Write the browser unit tests for Review Focus cases 1 to 3**

Create `src/features/meetings/meeting-editor.browser.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import App from "@/App";

// Layout cases that the feature spec for docs/specs/0002-scrollable-editor-with-chrome.md
// does not cover. The Tauri backend is replaced by an in-memory fake.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

type Meeting = {
    id: number;
    name: string;
    date: string;
    notes: string;
    createdAt: string;
    updatedAt: string;
};

let meetings: Meeting[];

function seed(name: string, notes: string) {
    const now = new Date().toISOString();
    meetings.push({
        id: meetings.length + 1,
        name,
        date: "2026-09-24",
        notes,
        createdAt: now,
        updatedAt: now,
    });
}

async function handle(command: string, args: Record<string, unknown> = {}) {
    switch (command) {
        case "list_meetings":
            return meetings.map(({ id, name, date, updatedAt }) => ({
                id,
                name,
                date,
                updatedAt,
            }));
        case "get_meeting":
            return meetings.find((m) => m.id === args.id) ?? null;
        case "update_meeting": {
            const meeting = meetings.find((m) => m.id === args.id);
            if (!meeting) throw `meeting ${String(args.id)} not found`;
            Object.assign(meeting, args);
            return meeting;
        }
        default:
            throw `unexpected command ${command}`;
    }
}

beforeEach(() => {
    meetings = [];
    invoke.mockReset();
    invoke.mockImplementation(handle);
});

afterEach(async () => {
    // Some tests make the window smaller. Other tests expect the default window
    // size of the application.
    await page.viewport(1200, 800);
});

/** Markdown with `count` paragraphs, "Paragraph 1" to "Paragraph <count>". */
function longNotes(count: number) {
    return Array.from({ length: count }, (_, i) => `Paragraph ${i + 1}`).join(
        "\n\n",
    );
}

/** Opens the meeting whose name starts with `name` from the Meetings page. */
async function openMeeting(name: string) {
    await userEvent.click(
        await screen.findByRole("link", { name: new RegExp(`^${name}`) }),
    );
    return screen.findByRole("textbox", { name: "Notes" });
}

function editorChrome() {
    return [
        screen.getByRole("navigation", { name: "breadcrumb" }),
        screen.getByRole("textbox", { name: "Meeting name" }),
        screen.getByLabelText("Meeting date"),
        screen.getByRole("toolbar", { name: "Formatting" }),
    ];
}

function positions(elements: Element[]) {
    return elements.map((element) => {
        const { top, bottom, left } = element.getBoundingClientRect();
        return { top, bottom, left };
    });
}

function isFullyVisible(element: Element) {
    const { top, bottom } = element.getBoundingClientRect();
    return top >= 0 && bottom <= window.innerHeight;
}

/** Scrolls with the mouse wheel over `element` until `target` is fully visible. */
async function scrollUntilVisible(element: Element, target: Element) {
    await userEvent.wheel(element, { delta: { y: 100000 } });
    await expect.poll(() => isFullyVisible(target)).toBe(true);
}

async function expectChromeStaysWhileNotesScroll(notes: HTMLElement) {
    const chrome = editorChrome();
    const before = positions(chrome);

    await scrollUntilVisible(
        within(notes).getByText("Paragraph 1"),
        within(notes).getByText("Paragraph 150"),
    );

    expect(positions(chrome)).toEqual(before);
    for (const element of chrome) expect(isFullyVisible(element)).toBe(true);
    expect(window.scrollY).toBe(0);
}

describe("MeetingEditor layout", () => {
    it("keeps the chrome in place at the minimum window size", async () => {
        await page.viewport(900, 600);
        seed("Weekly sync", longNotes(150));
        render(<App />);

        await expectChromeStaysWhileNotesScroll(
            await openMeeting("Weekly sync"),
        );
    });

    it("keeps the chrome in place when the sidebar is hidden", async () => {
        seed("Weekly sync", longNotes(150));
        render(<App />);
        const notes = await openMeeting("Weekly sync");

        await userEvent.click(
            screen.getByRole("button", { name: "Toggle Sidebar" }),
        );
        // Wait for the sidebar to finish sliding away.
        const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
        let left = NaN;
        await expect
            .poll(() => {
                const previous = left;
                left = toolbar.getBoundingClientRect().left;
                return left === previous;
            })
            .toBe(true);

        await expectChromeStaysWhileNotesScroll(notes);
    });

    it("shows the start of the notes when the user opens another meeting after scrolling", async () => {
        seed("Weekly sync", longNotes(150));
        seed("Planning", longNotes(150));
        render(<App />);
        let notes = await openMeeting("Weekly sync");
        await scrollUntilVisible(
            within(notes).getByText("Paragraph 1"),
            within(notes).getByText("Paragraph 150"),
        );

        await userEvent.click(
            within(
                screen.getByRole("navigation", { name: "breadcrumb" }),
            ).getByRole("link", { name: "Meetings" }),
        );
        notes = await openMeeting("Planning");

        const first = within(notes).getByText("Paragraph 1");
        expect(isFullyVisible(first)).toBe(true);
        expect(first.getBoundingClientRect().top).toBeGreaterThanOrEqual(
            screen
                .getByRole("toolbar", { name: "Formatting" })
                .getBoundingClientRect().bottom,
        );
    });
});
```

- [ ] **Step 3: Run the browser tests to see them fail**

Run: `bunx vitest run --project browser`
Expected: the 3 new tests and the 4 editor page specs FAIL, because the window scrolls and the chrome moves above the top of the window. The Meetings page spec passes.

- [ ] **Step 4: Make the editor page a grid**

In `src/features/meetings/meeting-editor.tsx`, replace the returned JSX of `MeetingEditor` with this. The name and date row loses its wrapper, and the editor becomes the last grid row.

```tsx
    return (
        // The header and the name and date row stay in place. The notes editor gets
        // the remaining height and scrolls its notes itself.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)]">
            <PageHeader
                crumbs={[
                    { label: "Meetings", to: "/meetings" },
                    { label: displayName(draft.name) },
                ]}
            >
                <SaveStatus status={status} onRetry={retry} />
            </PageHeader>
            <div className="flex items-center gap-2 px-4 pb-4">
                <Input
                    ref={nameInput}
                    aria-label="Meeting name"
                    value={draft.name}
                    placeholder={displayName("")}
                    onChange={(event) => {
                        const name = event.target.value;
                        setDraft((current) => ({ ...current, name }));
                    }}
                    className={cn(
                        PAGE_TITLE_CLASSES,
                        "h-auto border-none px-0 shadow-none focus-visible:ring-0",
                    )}
                />
                <Input
                    type="date"
                    aria-label="Meeting date"
                    value={draft.date}
                    required
                    onChange={(event) => {
                        const date = event.target.value;
                        // An incomplete or out of range value keeps the last complete
                        // date, because the backend accepts only `YYYY-MM-DD`.
                        if (!COMPLETE_DATE.test(date)) return;
                        setDraft((current) => ({ ...current, date }));
                    }}
                    // The base Input has `min-w-0`, so without `shrink-0` the name
                    // field, which fills the row, squeezes this field and cuts off the year.
                    className="w-auto shrink-0"
                />
            </div>
            <NotesEditor
                initialMarkdown={meeting.notes}
                onChange={changeNotes}
            />
        </div>
    );
```

- [ ] **Step 5: Make the notes editor a grid with a scrolling notes area**

In `src/features/meetings/notes-editor.tsx`:

1. Replace the docstring of `NotesEditor` with:

```tsx
/**
 * A rich text editor for meeting notes. It reads and writes Markdown.
 *
 * The editor fills the height of its container. The toolbar stays at the top, and the
 * notes scroll below it. Give the editor a container with a fixed height, such as a grid
 * row of `minmax(0,1fr)`.
 *
 * `initialMarkdown` is read only when the editor is created. To show a different note,
 * give the component a different `key`. `onChange` receives the notes as Markdown after
 * each change.
 */
```

2. In `editorProps.attributes.class`, replace `min-h-64` with `flex-1 pb-4`:

```tsx
                class: "notes-editor prose prose-sm dark:prose-invert max-w-none flex-1 pb-4 focus:outline-none",
```

3. Replace the returned JSX of `NotesEditor` with:

```tsx
    return (
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <div
                role="toolbar"
                aria-label="Formatting"
                className="mx-4 flex flex-wrap gap-1 border-b pb-2"
            >
                {TOOLBAR.map((item, index) => (
                    <Fragment key={item.label}>
                        <Toggle
                            size="sm"
                            aria-label={item.label}
                            pressed={active?.[index] ?? false}
                            // Keep the focus and the selection in the editor when the
                            // button is clicked with the mouse.
                            onMouseDown={(event) => event.preventDefault()}
                            onPressedChange={() => editor && item.run(editor)}
                        >
                            <item.icon />
                        </Toggle>
                        {item.label === "Italic" && editor && (
                            <LinkPopover
                                editor={editor}
                                open={linkOpen}
                                onOpenChange={(open) => {
                                    setLinkOpen(open);
                                    if (!open) editor.commands.focus();
                                }}
                            />
                        )}
                    </Fragment>
                ))}
            </div>
            {/* The notes area spans the full width, so its scroll bar is at the edge
                of the window. The editor stretches to fill it, so that a click below
                short notes puts the text cursor in the notes. */}
            <div className="flex overflow-y-auto px-4 pt-6">
                <EditorContent
                    editor={editor}
                    className="flex flex-1 flex-col"
                />
            </div>
        </div>
    );
```

The `pt-6` keeps the 24 pixels between the toolbar and the notes that the old `gap-6` gave. The bottom padding is on the editor itself (`pb-4`), so that a click in it still reaches the editor.

- [ ] **Step 6: Clip overflowing pages in the shell**

In `src/App.tsx`, now that no page relies on the window scrolling, add `overflow-hidden` to `SidebarInset`, so that a page that is too tall is cut off instead of making the window scroll:

```tsx
                    <SidebarInset className="min-h-0 overflow-hidden">
```

- [ ] **Step 7: Run the browser tests to see them pass**

Run: `bunx vitest run --project browser`
Expected: all 5 feature specs and all 3 new tests PASS.

- [ ] **Step 8: Write the test for Review Focus case 4 (long words)**

Add this test at the end of the `describe` block in `src/features/meetings/meeting-editor.browser.test.tsx`:

```tsx
    it("wraps a long unbroken word instead of scrolling sideways", async () => {
        const word = "x".repeat(400);
        seed("Weekly sync", word);
        render(<App />);
        const notes = await openMeeting("Weekly sync");

        const { right } = within(notes).getByText(word).getBoundingClientRect();
        expect(right).toBeLessThanOrEqual(window.innerWidth);
        expect(window.scrollX).toBe(0);
    });
```

- [ ] **Step 9: Run it to see it fail**

Run: `bunx vitest run --project browser -t "long unbroken word"`
Expected: FAIL with "expected 3372.5… to be less than or equal to 1200". The editor is a flex item, and a flex item's minimum width is the width of its longest word, so the word does not wrap.

- [ ] **Step 10: Let the editor shrink below the width of its longest word**

In `src/features/meetings/notes-editor.tsx`, add `min-w-0` to `EditorContent`, and add a sentence to the comment above the notes area:

```tsx
            {/* The notes area spans the full width, so its scroll bar is at the edge
                of the window. The editor stretches to fill it, so that a click below
                short notes puts the text cursor in the notes. Without `min-w-0`, a
                long word without spaces makes the editor wider than the window. */}
            <div className="flex overflow-y-auto px-4 pt-6">
                <EditorContent
                    editor={editor}
                    className="flex min-w-0 flex-1 flex-col"
                />
            </div>
```

- [ ] **Step 11: Run all tests**

Run: `bunx vitest run`
Expected: all jsdom tests and all browser tests PASS.

- [ ] **Step 12: Commit**

```bash
bun run fmt
git add vitest.config.ts docs/adrs/0006-run-layout-specs-in-a-real-browser.md CLAUDE.md src/App.tsx src/features/meetings/meeting-editor.tsx src/features/meetings/notes-editor.tsx src/features/meetings/meeting-editor.browser.test.tsx
git commit -m "Scroll the notes below the name, date, and toolbar

The editor page is a grid, and the notes editor fills its last row,
with the toolbar at the top and the notes scrolling below it. The
browser project now also runs *.browser.test.tsx unit tests, which
cover the minimum window size, a hidden sidebar, opening another
meeting after scrolling, and long words without spaces.

Claude-Session: https://claude.ai/code/session_016FgrFQoMuSV8Qk9UwhYj32"
```

### Task 3: Keep the link popover next to its text while the notes scroll

**Files:**
- Modify: `src/features/meetings/link-popover.tsx`
- Modify: `src/features/meetings/meeting-editor.browser.test.tsx`

**Interfaces:**
- Consumes: from Task 2, the notes inside a scrolling element, and the helpers `seed`, `longNotes`, `openMeeting`, and `scrollUntilVisible` in `meeting-editor.browser.test.tsx`.
- Produces: nothing that other tasks use.

The popover is positioned by Floating UI, through Base UI. Floating UI moves the popover when its anchor's scrolling ancestors scroll. Our anchor is a virtual element, an object with only `getBoundingClientRect`, so Floating UI does not know its ancestors and listens only for scrolling of the window. A virtual element can name a real element as its `contextElement`, and Floating UI then listens to that element's scrolling ancestors.

- [ ] **Step 1: Write the failing test**

In `src/features/meetings/meeting-editor.browser.test.tsx`, add this helper after `scrollUntilVisible`:

```tsx
/** The vertical space between two elements, or 0 if they overlap vertically. */
function distance(a: Element, b: Element) {
    const first = a.getBoundingClientRect();
    const second = b.getBoundingClientRect();
    return Math.max(0, first.top - second.bottom, second.top - first.bottom);
}
```

and add this test at the end of the `describe` block:

```tsx
    it("keeps the link popover next to the text while the notes scroll", async () => {
        seed("Weekly sync", longNotes(150));
        render(<App />);
        const notes = await openMeeting("Weekly sync");
        const last = within(notes).getByText("Paragraph 150");
        await scrollUntilVisible(within(notes).getByText("Paragraph 1"), last);
        await userEvent.tripleClick(last);
        await userEvent.click(screen.getByRole("button", { name: "Link" }));
        const popover = await screen.findByRole("dialog");
        const textTop = last.getBoundingClientRect().top;

        await userEvent.wheel(within(notes).getByText("Paragraph 140"), {
            delta: { y: -200 },
        });

        await expect
            .poll(() => last.getBoundingClientRect().top)
            .toBeGreaterThan(textTop + 100);
        await expect.poll(() => distance(popover, last)).toBeLessThan(16);
    });
```

The test checks that the popover is within 16 pixels above or below the text, not at an exact offset, because the popover can flip or shift near the edge of the window.

- [ ] **Step 2: Run it to see it fail**

Run: `bunx vitest run --project browser -t "link popover"`
Expected: FAIL with "Matcher did not succeed in time". The text moves down about 200 pixels, and the popover stays where it was.

- [ ] **Step 3: Give the anchor a context element**

In `src/features/meetings/link-popover.tsx`, change the `anchor` prop of `PopoverContent`:

```tsx
                // `contextElement` lets the popover follow the text when the notes
                // scroll, not only when the window scrolls.
                anchor={() => ({
                    getBoundingClientRect: () => linkTextRect(editor),
                    contextElement: editor.view.dom,
                })}
```

- [ ] **Step 4: Run all tests**

Run: `bunx vitest run`
Expected: all jsdom tests and all browser tests PASS.

- [ ] **Step 5: Commit**

```bash
bun run fmt
git add src/features/meetings/link-popover.tsx src/features/meetings/meeting-editor.browser.test.tsx
git commit -m "Keep the link popover next to its text while the notes scroll

Claude-Session: https://claude.ai/code/session_016FgrFQoMuSV8Qk9UwhYj32"
```

### Task 4: Verify

**Files:** none, unless a check fails.

- [ ] **Step 1: Run every check**

Run: `bun run check`
Expected: typecheck, lint, formatting, all jsdom and browser tests, and the Rust checks pass.

- [ ] **Step 2: Look at the result in the real application**

Run `bun run tauri dev`. Open a meeting with notes longer than the window, and check by eye:

- The notes scroll with the trackpad, and the header, the name, the date, and the toolbar do not move.
- The scroll bar of the notes is at the right edge of the window.
- The space between the toolbar and the notes is the same as before.
- The meeting name on the editor page and the "Meetings" title on the Meetings page are at the same position.
- On the Meetings page with a long list, the list scrolls below the title.

- [ ] **Step 3: Push, and mark the pull request as ready for review**

```bash
git push
gh pr ready 8
```
