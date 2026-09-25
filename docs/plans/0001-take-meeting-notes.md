# Take Meeting Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user list their meetings, create a new meeting with one click, and write notes for it in a rich text editor. The name, date, and notes are saved automatically to a SQLite database in the application data directory, with the notes stored as Markdown.

**Architecture:** The frontend gets an application shell: a floating sidebar for navigation, and a main area with a header and the current page. React Router, with its history kept in memory, chooses the page. The Rust backend owns the SQLite database. It opens the database at startup, applies migrations, and exposes four commands (`list_meetings`, `create_meeting`, `get_meeting`, `update_meeting`). The frontend calls those commands only through `src/lib/meetings.ts`. The notes editor is TipTap. The frontend converts the notes to and from Markdown, and the backend stores the Markdown as plain text.

**Tech Stack:** Tauri 2, React 19, TypeScript 6, Vite 8, Bun, Tailwind CSS 4, shadcn (base-nova style, built on Base UI), React Router 8, TipTap 3 with `@tiptap/markdown`, Rust with `rusqlite` 0.40 and `rusqlite_migration` 2.6, Vitest 5 with jsdom and React Testing Library.

**Spec:** `docs/specs/0001-take-meeting-notes.md` and the executable spec `src/features/meetings/meetings.spec.tsx`. The decisions behind this plan are in `docs/adrs/0001-use-sidebar-app-shell.md` through `docs/adrs/0004-store-notes-as-markdown.md`. Read the spec and the ADRs before you start a task.

## Global Constraints

- Use Bun for every JavaScript command (`bun`, `bunx`). Do not use npm, yarn, or pnpm.
- TypeScript files are formatted by Prettier with 4 spaces for each level of indentation. Run `bun run fmt` after you change TypeScript files and before you commit.
- Rust is linted by clippy with `clippy::pedantic` enabled, and any warning fails the check.
- Document every exported TypeScript item and every public Rust item with a docstring written in the ASD-STE100 standard: short sentences, one instruction or fact per sentence, active voice, and simple words.
- Do not refer to sections of an ADR or of this plan in code comments or docstrings.
- Do not change `docs/features/`, the ADRs, `docs/specs/0001-take-meeting-notes.md`, or `src/features/meetings/meetings.spec.tsx`. If one of them seems wrong, stop and ask a human.
- The text that users see must match the spec exactly: "Meetings", "New note", "No meetings yet", "Couldn't load meetings", "Retry", "Untitled meeting", "Meeting name", "Meeting date", "Notes", "Bold", "Italic", "Heading", "Bullet list", "Numbered list", "Task list", "Saving…" (with the single character `…`), "Saved", "Couldn't save", "This meeting doesn't exist".
- Commit after each task, or more often where a task says so. Push each commit to the draft pull request right away with `git push`. Write commit messages as a short imperative summary line, then a blank line, then a body that explains why. End each commit message with the attribution lines that the orchestrating session gives you.
- The feature spec (`meetings.spec.tsx`) is expected to fail until Task 4 is complete. Every other check must pass at the end of each task. At the end of each task, run the **task check**:

  ```bash
  bun run typecheck && bun run lint && bun run fmt:check \
    && bunx vitest run --exclude "src/**/*.spec.tsx" \
    && bun run fmt:rust:check && bun run lint:rust && bun run test:rust
  ```

  Expected: every command succeeds.

## Review Focus

These are the inputs and conditions most likely to hurt a real user that the feature spec does not test. Each one has a test in the task that owns the code.

1. **The date field is cleared.** A native date field reports an empty value while the user is partway through typing a date. The editor must keep the last complete date and never send an empty or invalid date to the backend. (Task 3, `meeting-editor-page.test.tsx`)
2. **The meeting name is empty.** The list and the breadcrumb must show "Untitled meeting" instead of a blank line. (Task 2, `meetings-page.test.tsx`, and Task 3, `meeting-editor-page.test.tsx`)
3. **Time zones.** The date `2026-09-24` must be shown as September 24 in every time zone, and "today" must be the local calendar date. `new Date("2026-09-24")` means midnight UTC, which is September 23 in time zones west of UTC, so the code must not use it. (Task 2 and Task 3, `dates.test.ts`)
4. **"New note" is clicked twice quickly.** Only one meeting must be created. (Task 3, `meetings-page.test.tsx`)
5. **Invalid or impossible dates reach the backend.** The backend must reject dates such as `2026-02-30` or `2026-9-24` instead of storing them. (Task 3, `src-tauri/src/meetings.rs` tests)

## File Structure

Frontend (`src/`):

| File | Responsibility |
| --- | --- |
| `App.tsx` | Providers, the memory router, the shell, and the routes. |
| `components/app-sidebar.tsx` | The floating sidebar: application name and the "Main" navigation. |
| `components/page-header.tsx` | The header of each page: sidebar button, breadcrumb trail, and optional content at the right side. |
| `components/ui/*` | shadcn components, generated by the shadcn command line tool. |
| `hooks/use-mobile.ts` | Generated by shadcn and rewritten to satisfy the React hooks lint rules. |
| `lib/dates.ts` | Conversion between `Date` values and meeting dates (`YYYY-MM-DD`), and formatting for people. |
| `lib/meetings.ts` | Meeting types and the only calls to the meeting commands. |
| `features/meetings/meetings-page.tsx` | The Meetings page: list, "New note", loading and error states. |
| `features/meetings/meeting-editor-page.tsx` | Loads one meeting by the identifier in the route. Shows loading, error, and not found states. |
| `features/meetings/meeting-editor.tsx` | Name, date, and notes of one meeting, with automatic saving. |
| `features/meetings/use-autosave.ts` | A hook that saves a value automatically after the user pauses. |
| `features/meetings/save-status.tsx` | The "Saving…", "Saved", and "Couldn't save" status, with a Retry button. |
| `features/meetings/notes-editor.tsx` | The TipTap editor and its formatting toolbar. It reads and writes Markdown. |
| `test/setup.ts` | Test setup, including stubs for browser APIs that jsdom does not implement. |

Backend (`src-tauri/src/`):

| File | Responsibility |
| --- | --- |
| `lib.rs` | Opens the database at startup, keeps it in Tauri managed state, and defines the thin command functions. |
| `db.rs` | Opens the database file and applies migrations. |
| `meetings.rs` | All SQL for meetings, the `Meeting` and `MeetingSummary` types, and the meeting error type. |

---

### Task 1: Application shell and navigation

Replace the Tauri starter screen with the application shell. After this task, the application opens on an empty Meetings page inside the floating sidebar layout. Nothing is stored yet.

**Files:**
- Create: `src/components/app-sidebar.tsx` (replaces the file that shadcn generates)
- Create: `src/components/page-header.tsx`
- Create: `src/features/meetings/meetings-page.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/test/setup.ts`, `src/hooks/use-mobile.ts` (generated), `index.html`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `CLAUDE.md`, `package.json`, `bun.lock`
- Delete: `src/App.css`, `src/assets/react.svg`, `public/tauri.svg`
- Generated by shadcn: `src/components/ui/{sidebar,breadcrumb,separator,sheet,skeleton,tooltip,input}.tsx`

**Interfaces:**
- Produces: `PageHeader({ crumbs: Crumb[]; children?: ReactNode })`, where `Crumb = { label: string; to?: string }`. An item without `to` is the current page. `MeetingsPage()` is exported from `src/features/meetings/meetings-page.tsx`. The sidebar navigation is a `<nav aria-label="Main">`, and the breadcrumb is shadcn's `<nav aria-label="breadcrumb">`.

- [ ] **Step 1: Install React Router and the sidebar block**

```bash
bun add react-router
bunx --bun shadcn@latest add sidebar-04 --yes --overwrite
git checkout -- src/components/ui/button.tsx
bun run fmt
```

The shadcn tool asks to overwrite `button.tsx`, and `--overwrite` answers yes so that the command can run without a prompt. The `git checkout` then restores our formatted copy. The block creates `src/components/app-sidebar.tsx`, `src/hooks/use-mobile.ts`, and several files in `src/components/ui/`.

- [ ] **Step 2: Write the failing test**

Replace the contents of `src/App.test.tsx` with:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
    it("opens on the Meetings page inside the application shell", () => {
        render(<App />);

        expect(
            within(screen.getByRole("navigation", { name: "Main" })).getByRole(
                "link",
                { name: "Meetings" },
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("navigation", { name: "breadcrumb" }),
        ).toHaveTextContent("Meetings");
    });
});
```

- [ ] **Step 3: Run the test to verify that it fails**

Run: `bun run test src/App.test.tsx`
Expected: FAIL, because no navigation landmark named "Main" exists.

- [ ] **Step 4: Stub `matchMedia` for tests**

The shadcn sidebar calls `window.matchMedia` to find out if the window is narrow, and jsdom does not implement it. Replace the contents of `src/test/setup.ts` with:

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
    cleanup();
});

// jsdom does not implement layout. The stubs below give the browser APIs that
// the sidebar and the rich text editor call a harmless result.

// The sidebar uses matchMedia to decide if the window is narrow.
window.matchMedia = (query: string) =>
    ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    }) as MediaQueryList;
```

- [ ] **Step 5: Rewrite the generated `use-mobile.ts`**

The generated hook calls `setState` directly inside an effect, which the `react-hooks/set-state-in-effect` lint rule rejects. Replace the contents of `src/hooks/use-mobile.ts` with a version that uses `useSyncExternalStore`, which is React's way to read a value from a browser API:

```ts
import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
    const mql = window.matchMedia(MOBILE_QUERY);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
}

/** Returns true when the window is narrower than the mobile breakpoint. */
export function useIsMobile() {
    return React.useSyncExternalStore(
        subscribe,
        () => window.matchMedia(MOBILE_QUERY).matches,
        () => false,
    );
}
```

- [ ] **Step 6: Write the sidebar**

Replace the contents of `src/components/app-sidebar.tsx`, which shadcn generated with sample content, with:

```tsx
import { NotebookPenIcon } from "lucide-react";
import { Link, useLocation } from "react-router";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";

/** A section of the application that the sidebar links to. */
type Section = { title: string; path: string };

const SECTIONS: Section[] = [{ title: "Meetings", path: "/meetings" }];

/** The floating sidebar with the application name and the navigation between sections. */
export function AppSidebar() {
    const { pathname } = useLocation();

    return (
        <Sidebar variant="floating">
            <SidebarHeader>
                <div className="flex items-center gap-2 p-2">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                        <NotebookPenIcon className="size-4" />
                    </div>
                    <span className="font-medium">gps</span>
                </div>
            </SidebarHeader>
            <SidebarContent>
                <nav aria-label="Main">
                    <SidebarGroup>
                        <SidebarMenu className="gap-2">
                            {SECTIONS.map((section) => (
                                <SidebarMenuItem key={section.path}>
                                    <SidebarMenuButton
                                        isActive={pathname.startsWith(
                                            section.path,
                                        )}
                                        render={
                                            <Link
                                                to={section.path}
                                                className="font-medium"
                                            />
                                        }
                                    >
                                        {section.title}
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroup>
                </nav>
            </SidebarContent>
        </Sidebar>
    );
}
```

- [ ] **Step 7: Write the page header**

Create `src/components/page-header.tsx`:

```tsx
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** One item of the breadcrumb trail. An item without `to` is the current page. */
export type Crumb = { label: string; to?: string };

/**
 * The header at the top of each page. It shows the button that shows or hides the sidebar,
 * the breadcrumb trail, and optional content at the right side, such as a status.
 */
export function PageHeader({
    crumbs,
    children,
}: {
    crumbs: Crumb[];
    children?: ReactNode;
}) {
    return (
        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
                orientation="vertical"
                className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
                <BreadcrumbList>
                    {crumbs.map((crumb, index) => (
                        <Fragment key={index}>
                            {index > 0 && <BreadcrumbSeparator />}
                            <BreadcrumbItem>
                                {crumb.to ? (
                                    <BreadcrumbLink
                                        render={<Link to={crumb.to} />}
                                    >
                                        {crumb.label}
                                    </BreadcrumbLink>
                                ) : (
                                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                                )}
                            </BreadcrumbItem>
                        </Fragment>
                    ))}
                </BreadcrumbList>
            </Breadcrumb>
            {children && (
                <div className="ml-auto flex items-center gap-2">{children}</div>
            )}
        </header>
    );
}
```

- [ ] **Step 8: Write the first version of the Meetings page**

Create `src/features/meetings/meetings-page.tsx`. It shows only the header for now. Task 2 adds the list.

```tsx
import { PageHeader } from "@/components/page-header";

/** The page that lists all meetings. */
export function MeetingsPage() {
    return <PageHeader crumbs={[{ label: "Meetings" }]} />;
}
```

- [ ] **Step 9: Replace the starter screen with the shell and routes**

Replace the contents of `src/App.tsx` with:

```tsx
import { CSSProperties } from "react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MeetingsPage } from "@/features/meetings/meetings-page";

function App() {
    return (
        <TooltipProvider>
            <MemoryRouter>
                <SidebarProvider
                    style={{ "--sidebar-width": "19rem" } as CSSProperties}
                >
                    <AppSidebar />
                    <SidebarInset>
                        <Routes>
                            <Route
                                path="/"
                                element={<Navigate to="/meetings" replace />}
                            />
                            <Route path="/meetings" element={<MeetingsPage />} />
                        </Routes>
                    </SidebarInset>
                </SidebarProvider>
            </MemoryRouter>
        </TooltipProvider>
    );
}

export default App;
```

Then remove the starter files, and give the window its title:

```bash
git rm -q src/App.css src/assets/react.svg public/tauri.svg
sed -i '' 's#<title>Tauri + React + Typescript</title>#<title>gps</title>#' index.html
```

(`sed -i ''` is the macOS form. On Linux, use `sed -i` without the empty string.)

- [ ] **Step 10: Run the test to verify that it passes**

Run: `bun run test src/App.test.tsx`
Expected: PASS.

- [ ] **Step 11: Remove the starter command and resize the window**

Replace the contents of `src-tauri/src/lib.rs` with:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

In `src-tauri/tauri.conf.json`, replace the window entry with:

```json
      {
        "title": "gps",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
```

- [ ] **Step 12: Update CLAUDE.md**

Make these changes in `CLAUDE.md`:

- Under "Running a single test", change the TypeScript example to ``bun run test src/App.test.tsx` or `bunx vitest run -t "opens on the Meetings page"`` and the Rust example to ``cargo test --manifest-path src-tauri/Cargo.toml <test name>``.
- Under "Testing conventions", add: "`src/test/setup.ts` also stubs browser APIs that jsdom does not implement, such as `window.matchMedia`, which the sidebar uses. When a component fails in tests because jsdom lacks a browser API, add a minimal stub there with a comment that says which component needs it."
- Under "Architecture", after the "Frontend" item, add: "**Shell and routing**: `App.tsx` wraps every page in the application shell, which is the shadcn `sidebar-04` floating sidebar (`src/components/app-sidebar.tsx`) and a main area. Each page renders `PageHeader` (`src/components/page-header.tsx`) first, with its breadcrumb trail. Routing uses React Router with a `MemoryRouter`, because a desktop window has no address bar; the application always starts at `/`. The sidebar is for navigation between sections only. Each section gets one item in `SECTIONS` in `app-sidebar.tsx` and its routes in `App.tsx`. Feature code lives in `src/features/<feature>/`."
- In the "UI components" item, add after the sentence about `bun run fmt`: "Generated code must pass our lint rules too. If it does not, fix the generated file rather than turning off the rule (for example, `src/hooks/use-mobile.ts` was rewritten to use `useSyncExternalStore`)."

- [ ] **Step 13: Run the task check and commit**

Run the task check from Global Constraints. Expected: all commands succeed.

```bash
git add -A
git commit -m "Replace the starter screen with the application shell"
git push
```

---

### Task 2: List meetings from the database

The backend opens the SQLite database at startup and lists meetings. The Meetings page shows the list, an empty state, a loading state, and an error state with a Retry button. After this task, the Meetings page shows "No meetings yet", because there is no way to create a meeting yet.

**Files:**
- Create: `src-tauri/src/db.rs`, `src-tauri/src/meetings.rs`
- Create: `src/lib/dates.ts`, `src/lib/dates.test.ts`, `src/lib/meetings.ts`, `src/lib/meetings.test.ts`, `src/features/meetings/meetings-page.test.tsx`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src/features/meetings/meetings-page.tsx`, `src/App.test.tsx`, `CLAUDE.md`

**Interfaces:**
- Consumes: `PageHeader` and `Crumb` from Task 1.
- Produces (Rust): `db::open(path: &Path) -> Result<Connection, rusqlite_migration::Error>`, `db::open_in_memory() -> Connection` (tests only), `meetings::MeetingSummary { id: i64, name: String, date: String, updated_at: String }` (serialized in camelCase), `meetings::Error`, `meetings::list(&Connection) -> Result<Vec<MeetingSummary>, Error>`, the `Database` managed state with `Database::run`, and the `list_meetings` command.
- Produces (TypeScript): `formatMeetingDate(date: string): string` in `@/lib/dates`. In `@/lib/meetings`: `type MeetingSummary = { id: number; name: string; date: string; updatedAt: string }`, `DEFAULT_MEETING_NAME = "Untitled meeting"`, `listMeetings(): Promise<MeetingSummary[]>`, and `displayName(name: string): string`.

- [ ] **Step 1: Add the Rust dependencies**

```bash
cd src-tauri
cargo add rusqlite@0.40 --features bundled
cargo add rusqlite_migration@2.6
cd ..
```

The `bundled` feature compiles SQLite into the application, so it does not depend on the SQLite that the computer has installed.

- [ ] **Step 2: Write the database module with its tests**

Create `src-tauri/src/db.rs`:

```rust
//! Opening the application database and keeping its structure up to date.

use std::path::Path;

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

/// The changes to the database structure, in the order they are applied.
/// Add new migrations to the end. Never change or remove a migration after it is released.
const MIGRATIONS: &[M<'static>] = &[M::up(
    "CREATE TABLE meetings (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        notes      TEXT NOT NULL DEFAULT '',
        date       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );",
)];

/// Opens the database file at `path`, and creates it if it does not exist.
/// Applies all migrations that were not applied before.
pub fn open(path: &Path) -> Result<Connection, rusqlite_migration::Error> {
    let mut connection = Connection::open(path)?;
    migrate(&mut connection)?;
    Ok(connection)
}

/// Opens a new database that exists only in memory, with all migrations applied.
/// Use this function in tests.
#[cfg(test)]
pub fn open_in_memory() -> Connection {
    let mut connection = Connection::open_in_memory().expect("open in-memory database");
    migrate(&mut connection).expect("apply migrations");
    connection
}

fn migrate(connection: &mut Connection) -> Result<(), rusqlite_migration::Error> {
    Migrations::from_slice(MIGRATIONS).to_latest(connection)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_valid() {
        assert!(Migrations::from_slice(MIGRATIONS).validate().is_ok());
    }

    #[test]
    fn open_creates_the_file_and_can_be_opened_again() {
        let dir = std::env::temp_dir().join(format!("gps-db-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("gps.sqlite");
        drop(open(&path).unwrap());
        let connection = open(&path).unwrap();
        let count: i64 = connection
            .query_row("SELECT count(*) FROM meetings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
```

- [ ] **Step 3: Write the failing test for listing meetings**

Create `src-tauri/src/meetings.rs` with the types, an empty `list` function, and the tests. The test helper `insert` writes rows directly with SQL, because there is no function to create meetings until Task 3.

```rust
//! Storage of meetings and their notes in the application database.

use std::fmt;

use rusqlite::Connection;
use serde::Serialize;

/// The part of a meeting that the list of meetings shows. It does not include the notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingSummary {
    /// The identifier that the database gives the meeting.
    pub id: i64,
    /// The name of the meeting.
    pub name: String,
    /// The calendar date of the meeting, in the format `YYYY-MM-DD`.
    pub date: String,
    /// The time when the meeting was last changed, as an RFC 3339 timestamp in UTC.
    pub updated_at: String,
}

/// A problem that stops a meeting operation.
#[derive(Debug)]
pub enum Error {
    /// The database reported an error.
    Database(rusqlite::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Database(error) => write!(f, "database error: {error}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<rusqlite::Error> for Error {
    fn from(error: rusqlite::Error) -> Self {
        Error::Database(error)
    }
}

/// Returns summaries of all meetings. The newest date is first. For meetings with the same
/// date, the meeting that was created last is first.
pub fn list(_connection: &Connection) -> Result<Vec<MeetingSummary>, Error> {
    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use rusqlite::params;

    use super::*;
    use crate::db::open_in_memory;

    fn insert(connection: &Connection, name: &str, date: &str) -> i64 {
        connection
            .query_row(
                "INSERT INTO meetings (name, notes, date, created_at, updated_at)
                 VALUES (?1, '', ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 RETURNING id",
                params![name, date],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn list_is_empty_for_a_new_database() {
        assert!(list(&open_in_memory()).unwrap().is_empty());
    }

    #[test]
    fn list_orders_by_date_then_newest_created() {
        let connection = open_in_memory();
        let kickoff = insert(&connection, "Kickoff", "2026-09-18");
        let first_on_24th = insert(&connection, "Standup", "2026-09-24");
        let second_on_24th = insert(&connection, "Weekly sync", "2026-09-24");

        let summaries = list(&connection).unwrap();

        let ids: Vec<i64> = summaries.iter().map(|m| m.id).collect();
        assert_eq!(ids, vec![second_on_24th, first_on_24th, kickoff]);
        assert_eq!(summaries[0].name, "Weekly sync");
        assert_eq!(summaries[0].date, "2026-09-24");
        assert!(summaries[0].updated_at.ends_with('Z'));
    }
}
```

Add the modules to the top of `src-tauri/src/lib.rs`:

```rust
mod db;
mod meetings;
```

- [ ] **Step 4: Run the tests to verify that the listing test fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: `list_orders_by_date_then_newest_created` FAILS (the list is empty). The `db` tests and `list_is_empty_for_a_new_database` pass. Warnings about unused code are expected until Step 6.

- [ ] **Step 5: Implement `list`**

Replace the `list` function in `src-tauri/src/meetings.rs` with:

```rust
/// Returns summaries of all meetings. The newest date is first. For meetings with the same
/// date, the meeting that was created last is first.
pub fn list(connection: &Connection) -> Result<Vec<MeetingSummary>, Error> {
    let mut statement = connection.prepare(
        "SELECT id, name, date, updated_at FROM meetings
         ORDER BY date DESC, created_at DESC, id DESC",
    )?;
    let summaries = statement
        .query_map([], |row| {
            Ok(MeetingSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                date: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(summaries)
}
```

The `id DESC` tie breaker matters because two meetings created in the same millisecond have the same `created_at`.

- [ ] **Step 6: Open the database at startup and add the `list_meetings` command**

Replace the contents of `src-tauri/src/lib.rs` with:

```rust
mod db;
mod meetings;

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{Manager, State};

use crate::meetings::MeetingSummary;

/// The name of the database file in the application data directory.
const DATABASE_FILE: &str = "gps.sqlite";

/// The open database connection, shared by all commands.
struct Database(Mutex<Connection>);

impl Database {
    /// Locks the connection, runs `operation` with it, and converts errors to messages for
    /// the frontend.
    fn run<T>(
        &self,
        operation: impl FnOnce(&Connection) -> Result<T, meetings::Error>,
    ) -> Result<T, String> {
        let connection = self
            .0
            .lock()
            .map_err(|_| "the database is not available".to_owned())?;
        operation(&connection).map_err(|error| error.to_string())
    }
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn list_meetings(database: State<'_, Database>) -> Result<Vec<MeetingSummary>, String> {
    database.run(meetings::list)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let connection = db::open(&directory.join(DATABASE_FILE))?;
            app.manage(Database(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_meetings])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Tauri gives managed state to a command as a `State` value, and clippy's pedantic `needless_pass_by_value` lint objects to that. The `#[expect]` attribute records the reason, and it fails the build if the lint stops applying.

- [ ] **Step 7: Run the Rust checks**

Run: `bun run fmt:rust && bun run lint:rust && bun run test:rust`
Expected: no clippy warnings, and all Rust tests pass.

- [ ] **Step 8: Commit the backend**

```bash
git add src-tauri
git commit -m "Store meetings in SQLite and add the list_meetings command"
git push
```

- [ ] **Step 9: Write the failing frontend library tests**

Create `src/lib/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatMeetingDate } from "./dates";

describe("formatMeetingDate", () => {
    it("formats the date in the medium style of the locale, on the same day", () => {
        const expected = new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
        }).format(new Date(2026, 8, 24));
        expect(formatMeetingDate("2026-09-24")).toBe(expected);
    });

    it("returns text that is not a meeting date unchanged", () => {
        expect(formatMeetingDate("")).toBe("");
        expect(formatMeetingDate("soon")).toBe("soon");
    });
});
```

Create `src/lib/meetings.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { displayName, listMeetings } from "./meetings";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue([]);
});

describe("meeting commands", () => {
    it("lists meetings with the list_meetings command", async () => {
        await listMeetings();

        expect(invoke).toHaveBeenCalledWith("list_meetings");
    });
});

describe("displayName", () => {
    it("shows the default name for an empty or blank name", () => {
        expect(displayName("")).toBe("Untitled meeting");
        expect(displayName("   ")).toBe("Untitled meeting");
        expect(displayName("Weekly sync")).toBe("Weekly sync");
    });
});
```

Run: `bun run test src/lib`
Expected: FAIL, because `./dates` and `./meetings` do not exist.

- [ ] **Step 10: Implement the library modules**

Create `src/lib/dates.ts`:

```ts
/**
 * Returns a meeting date (`YYYY-MM-DD`) written for people, in the medium date style of
 * the user's locale, such as "Sep 24, 2026". Returns the text unchanged if it is not a
 * meeting date.
 */
export function formatMeetingDate(date: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return date;
    const [, year, month, day] = match;
    // Construct the date in the local time zone. `new Date("2026-09-24")` is midnight
    // UTC, which is the previous day in time zones west of UTC.
    const local = new Date(Number(year), Number(month) - 1, Number(day));
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        local,
    );
}
```

Create `src/lib/meetings.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";

/** The part of a meeting that the list of meetings shows. The backend type is `MeetingSummary` in `src-tauri/src/meetings.rs`. */
export type MeetingSummary = {
    id: number;
    name: string;
    /** The calendar date of the meeting, in the format `YYYY-MM-DD`. */
    date: string;
    /** The time when the meeting was last changed, as an RFC 3339 timestamp in UTC. */
    updatedAt: string;
};

/** The name that the backend gives a new meeting. Also shown for a meeting with an empty name. */
export const DEFAULT_MEETING_NAME = "Untitled meeting";

/** Returns summaries of all meetings, with the newest date first. */
export function listMeetings(): Promise<MeetingSummary[]> {
    return invoke<MeetingSummary[]>("list_meetings");
}

/** Returns the name to show for a meeting. A meeting with an empty name shows the default name. */
export function displayName(name: string): string {
    return name.trim() === "" ? DEFAULT_MEETING_NAME : name;
}
```

Run: `bun run test src/lib`
Expected: PASS.

- [ ] **Step 11: Write the failing Meetings page tests**

Create `src/features/meetings/meetings-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { formatMeetingDate } from "@/lib/dates";
import { MeetingsPage } from "./meetings-page";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function renderPage() {
    render(
        <MemoryRouter>
            <SidebarProvider>
                <MeetingsPage />
            </SidebarProvider>
        </MemoryRouter>,
    );
}

function summary(id: number, name: string, date: string) {
    return { id, name, date, updatedAt: "2026-09-24T17:00:00.000Z" };
}

beforeEach(() => {
    invoke.mockReset();
});

describe("MeetingsPage", () => {
    it("says that there are no meetings", async () => {
        invoke.mockResolvedValue([]);
        renderPage();

        expect(await screen.findByText("No meetings yet")).toBeInTheDocument();
    });

    it("lists meetings in the order the backend returns, with name and date", async () => {
        invoke.mockResolvedValue([
            summary(2, "Weekly sync", "2026-09-24"),
            summary(1, "Kickoff", "2026-09-18"),
        ]);
        renderPage();

        const links = await screen.findAllByRole("link");
        expect(links).toHaveLength(2);
        expect(links[0]).toHaveTextContent("Weekly sync");
        expect(links[0]).toHaveTextContent(formatMeetingDate("2026-09-24"));
        expect(links[1]).toHaveTextContent("Kickoff");
    });

    it("shows a meeting with an empty name as Untitled meeting", async () => {
        invoke.mockResolvedValue([summary(1, "", "2026-09-24")]);
        renderPage();

        expect(
            await screen.findByRole("link", { name: /Untitled meeting/ }),
        ).toBeInTheDocument();
    });

    it("shows an error with a Retry button when the list cannot be loaded", async () => {
        invoke.mockRejectedValueOnce("database is locked");
        invoke.mockResolvedValueOnce([summary(1, "Kickoff", "2026-09-18")]);
        const user = userEvent.setup();
        renderPage();

        expect(
            await screen.findByText("Couldn't load meetings"),
        ).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Retry" }));

        expect(
            await screen.findByRole("link", { name: /Kickoff/ }),
        ).toBeInTheDocument();
    });
});
```

Run: `bun run test src/features/meetings/meetings-page.test.tsx`
Expected: FAIL, because the page does not load meetings yet.

- [ ] **Step 12: Implement the Meetings page list**

Replace the contents of `src/features/meetings/meetings-page.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatMeetingDate } from "@/lib/dates";
import {
    displayName,
    listMeetings,
    type MeetingSummary,
} from "@/lib/meetings";

type ListState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; meetings: MeetingSummary[] };

/** The page that lists all meetings. */
export function MeetingsPage() {
    const [list, setList] = useState<ListState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let current = true;
        listMeetings().then(
            (meetings) => current && setList({ kind: "loaded", meetings }),
            () => current && setList({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt]);

    function retry() {
        setList({ kind: "loading" });
        setAttempt((value) => value + 1);
    }

    return (
        <>
            <PageHeader crumbs={[{ label: "Meetings" }]} />
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
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
        </>
    );
}
```

The effect does not call `setList` synchronously, because the `react-hooks/set-state-in-effect` lint rule forbids it. The Retry handler sets the loading state and then changes `attempt`, which runs the effect again.

- [ ] **Step 13: Mock the backend in the App test**

The Meetings page now calls the backend when it opens. In `src/App.test.tsx`, add these lines after the imports:

```tsx
const invoke = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
```

Add `vi` to the `vitest` import.

- [ ] **Step 14: Update CLAUDE.md**

- Under "Testing conventions", change "(see `src/App.test.tsx`)" to "(see `src/lib/meetings.test.ts`)".
- Under "Architecture", after the "Backend" item, add: "**Database**: the backend owns a SQLite database (`rusqlite` with bundled SQLite), stored as `gps.sqlite` in the application data directory. `db.rs` opens it at startup and applies the migrations in `MIGRATIONS`; add new migrations to the end of that list and never change a released one. Each kind of data has its own module with all of its SQL, starting with `meetings.rs`; its functions take a `&Connection` and are tested against `db::open_in_memory()`. The command functions in `lib.rs` stay thin: they call `Database::run` with a module function. Commands take `State` by value, so each has `#[expect(clippy::needless_pass_by_value)]`. On the frontend, `src/lib/meetings.ts` holds the TypeScript types and the only `invoke` calls for meetings."

- [ ] **Step 15: Run the task check and commit**

Run the task check from Global Constraints. Expected: all commands succeed. In the feature spec, the scenarios "lists meetings with their name and date…" and "shows an error with a Retry button…" now pass (`bunx vitest run src/features/meetings/meetings.spec.tsx`). The other scenarios still fail.

```bash
git add -A
git commit -m "List meetings on the Meetings page"
git push
```

---

### Task 3: Create a meeting and edit its name and date

The user can click "New note" to create a meeting, and the editor page for it opens. The user can change the meeting's name and date, and the changes are saved automatically. The notes are carried along unchanged, because the notes editor comes in Task 4.

**Files:**
- Create: `src/features/meetings/use-autosave.ts`, `src/features/meetings/use-autosave.test.ts`, `src/features/meetings/save-status.tsx`, `src/features/meetings/meeting-editor.tsx`, `src/features/meetings/meeting-editor-page.tsx`, `src/features/meetings/meeting-editor-page.test.tsx`
- Modify: `src-tauri/src/meetings.rs`, `src-tauri/src/lib.rs`, `src/lib/dates.ts`, `src/lib/dates.test.ts`, `src/lib/meetings.ts`, `src/lib/meetings.test.ts`, `src/features/meetings/meetings-page.tsx`, `src/features/meetings/meetings-page.test.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `Database::run`, `meetings::list`, `db::open_in_memory`, `PageHeader`, `formatMeetingDate`, `displayName`, `listMeetings`.
- Produces (Rust): `meetings::Meeting { id, name, date, notes, created_at, updated_at }` (camelCase), `meetings::DEFAULT_NAME`, `meetings::create(&Connection, date: &str) -> Result<Meeting, Error>`, `meetings::get(&Connection, id: i64) -> Result<Option<Meeting>, Error>`, `meetings::update(&Connection, id, name, date, notes) -> Result<Meeting, Error>`, `Error::NotFound(i64)`, `Error::InvalidDate(String)`, and the commands `create_meeting(date)`, `get_meeting(id)` (returns `null` for an unknown identifier), and `update_meeting(id, name, date, notes)`.
- Produces (TypeScript): `toMeetingDate(now: Date): string`. In `@/lib/meetings`: `Meeting`, `MeetingChanges = { name; date; notes }`, `createMeeting(date)`, `getMeeting(id): Promise<Meeting | null>`, and `updateMeeting(id, changes)`. `useAutosave<T>(value: T, save: (value: T) => Promise<unknown>, delay?: number): { status: AutosaveStatus; retry: () => void }` with `AutosaveStatus = "idle" | "saving" | "saved" | "error"`. `SaveStatus({ status, onRetry })`. `MeetingEditor({ meeting, isNew })`. `MeetingEditorPage()`. `NewMeetingState = { isNew: true }`, which is the router state that the Meetings page gives the editor page.

- [ ] **Step 1: Write the complete meetings module with its tests**

Replace the contents of `src-tauri/src/meetings.rs` with the version below. The new tests cover creation defaults, invalid dates, unknown identifiers, and updates. The test `list_orders_by_date_then_newest_created` now uses `create` instead of the SQL helper.

```rust
//! Storage of meetings and their notes in the application database.

use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

/// The name that a new meeting gets before the user changes it.
pub const DEFAULT_NAME: &str = "Untitled meeting";

/// One meeting, with its notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Meeting {
    /// The identifier that the database gives the meeting.
    pub id: i64,
    /// The name of the meeting.
    pub name: String,
    /// The calendar date of the meeting, in the format `YYYY-MM-DD`.
    pub date: String,
    /// The notes, as Markdown.
    pub notes: String,
    /// The time when the meeting was created, as an RFC 3339 timestamp in UTC.
    pub created_at: String,
    /// The time when the meeting was last changed, as an RFC 3339 timestamp in UTC.
    pub updated_at: String,
}

/// The part of a meeting that the list of meetings shows. It does not include the notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingSummary {
    /// The identifier that the database gives the meeting.
    pub id: i64,
    /// The name of the meeting.
    pub name: String,
    /// The calendar date of the meeting, in the format `YYYY-MM-DD`.
    pub date: String,
    /// The time when the meeting was last changed, as an RFC 3339 timestamp in UTC.
    pub updated_at: String,
}

/// A problem that stops a meeting operation.
#[derive(Debug)]
pub enum Error {
    /// No meeting has the given identifier.
    NotFound(i64),
    /// The date is not a real calendar date in the format `YYYY-MM-DD`.
    InvalidDate(String),
    /// The database reported an error.
    Database(rusqlite::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NotFound(id) => write!(f, "meeting {id} not found"),
            Error::InvalidDate(date) => {
                write!(f, "invalid meeting date \"{date}\": use the format YYYY-MM-DD")
            }
            Error::Database(error) => write!(f, "database error: {error}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<rusqlite::Error> for Error {
    fn from(error: rusqlite::Error) -> Self {
        Error::Database(error)
    }
}

/// The SQL expression for the current time, as an RFC 3339 timestamp in UTC with milliseconds.
const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/// Returns summaries of all meetings. The newest date is first. For meetings with the same
/// date, the meeting that was created last is first.
pub fn list(connection: &Connection) -> Result<Vec<MeetingSummary>, Error> {
    let mut statement = connection.prepare(
        "SELECT id, name, date, updated_at FROM meetings
         ORDER BY date DESC, created_at DESC, id DESC",
    )?;
    let summaries = statement
        .query_map([], |row| {
            Ok(MeetingSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                date: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(summaries)
}

/// Creates a meeting with the default name, empty notes, and the given date.
pub fn create(connection: &Connection, date: &str) -> Result<Meeting, Error> {
    validate_date(connection, date)?;
    let id = connection.query_row(
        &format!(
            "INSERT INTO meetings (name, notes, date, created_at, updated_at)
             VALUES (?1, '', ?2, {NOW}, {NOW}) RETURNING id"
        ),
        params![DEFAULT_NAME, date],
        |row| row.get(0),
    )?;
    get(connection, id)?.ok_or(Error::NotFound(id))
}

/// Returns the meeting with the given identifier, or `None` if no meeting has it.
pub fn get(connection: &Connection, id: i64) -> Result<Option<Meeting>, Error> {
    let meeting = connection
        .query_row(
            "SELECT id, name, date, notes, created_at, updated_at FROM meetings WHERE id = ?1",
            params![id],
            meeting_from_row,
        )
        .optional()?;
    Ok(meeting)
}

/// Replaces the name, date, and notes of a meeting, and sets the time it was last changed.
/// Returns the meeting as it is stored after the change.
pub fn update(
    connection: &Connection,
    id: i64,
    name: &str,
    date: &str,
    notes: &str,
) -> Result<Meeting, Error> {
    validate_date(connection, date)?;
    let changed = connection.execute(
        &format!(
            "UPDATE meetings SET name = ?2, date = ?3, notes = ?4, updated_at = {NOW}
             WHERE id = ?1"
        ),
        params![id, name, date, notes],
    )?;
    if changed == 0 {
        return Err(Error::NotFound(id));
    }
    get(connection, id)?.ok_or(Error::NotFound(id))
}

// SQLite's `date()` function returns NULL for text that is not a date, and moves impossible
// dates such as `2026-02-30` to a different day. A date is valid only if `date()` returns it
// unchanged.
fn validate_date(connection: &Connection, date: &str) -> Result<(), Error> {
    let valid: bool = connection.query_row(
        "SELECT length(?1) = 10 AND date(?1) IS ?1",
        params![date],
        |row| row.get(0),
    )?;
    if valid {
        Ok(())
    } else {
        Err(Error::InvalidDate(date.to_owned()))
    }
}

fn meeting_from_row(row: &Row<'_>) -> rusqlite::Result<Meeting> {
    Ok(Meeting {
        id: row.get(0)?,
        name: row.get(1)?,
        date: row.get(2)?,
        notes: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[test]
    fn list_is_empty_for_a_new_database() {
        assert!(list(&open_in_memory()).unwrap().is_empty());
    }

    #[test]
    fn create_uses_default_name_empty_notes_and_given_date() {
        let connection = open_in_memory();
        let meeting = create(&connection, "2026-09-24").unwrap();
        assert_eq!(meeting.name, "Untitled meeting");
        assert_eq!(meeting.notes, "");
        assert_eq!(meeting.date, "2026-09-24");
        assert_eq!(meeting.created_at, meeting.updated_at);
        assert_eq!(meeting.created_at.len(), "2026-09-24T17:03:12.456Z".len());
        assert!(meeting.created_at.ends_with('Z'));
    }

    #[test]
    fn create_rejects_invalid_dates() {
        let connection = open_in_memory();
        for date in ["", "yesterday", "2026-9-24", "2026-02-30", "2026-09-24T10:00"] {
            assert!(
                matches!(create(&connection, date), Err(Error::InvalidDate(_))),
                "{date} should be rejected"
            );
        }
        assert!(list(&connection).unwrap().is_empty());
    }

    #[test]
    fn list_orders_by_date_then_newest_created() {
        let connection = open_in_memory();
        let kickoff = create(&connection, "2026-09-18").unwrap();
        let first_on_24th = create(&connection, "2026-09-24").unwrap();
        let second_on_24th = create(&connection, "2026-09-24").unwrap();
        let ids: Vec<i64> = list(&connection).unwrap().iter().map(|m| m.id).collect();
        assert_eq!(ids, vec![second_on_24th.id, first_on_24th.id, kickoff.id]);
    }

    #[test]
    fn get_returns_none_for_unknown_id() {
        let connection = open_in_memory();
        assert_eq!(get(&connection, 42).unwrap(), None);
    }

    #[test]
    fn update_replaces_fields_and_keeps_notes_unchanged() {
        let connection = open_in_memory();
        let created = create(&connection, "2026-09-24").unwrap();
        let notes = "## Agenda\n\n- [ ] Send notes to team\n";
        let updated = update(&connection, created.id, "Weekly sync", "2026-09-25", notes).unwrap();
        assert_eq!(updated.name, "Weekly sync");
        assert_eq!(updated.date, "2026-09-25");
        assert_eq!(updated.notes, notes);
        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at >= created.updated_at);
        assert_eq!(get(&connection, created.id).unwrap(), Some(updated));
    }

    #[test]
    fn update_reports_unknown_id_and_invalid_date() {
        let connection = open_in_memory();
        assert!(matches!(
            update(&connection, 42, "x", "2026-09-24", ""),
            Err(Error::NotFound(42))
        ));
        let created = create(&connection, "2026-09-24").unwrap();
        assert!(matches!(
            update(&connection, created.id, "x", "not a date", ""),
            Err(Error::InvalidDate(_))
        ));
        assert_eq!(get(&connection, created.id).unwrap(), Some(created));
    }
}
```

- [ ] **Step 2: Run the Rust tests**

Run: `bun run test:rust`
Expected: all tests pass. (Clippy reports the new functions as unused until Step 3.)

- [ ] **Step 3: Add the commands**

In `src-tauri/src/lib.rs`, change the `use crate::meetings::...` line to:

```rust
use crate::meetings::{Meeting, MeetingSummary};
```

Add these commands after `list_meetings`:

```rust
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn create_meeting(database: State<'_, Database>, date: &str) -> Result<Meeting, String> {
    database.run(|connection| meetings::create(connection, date))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn get_meeting(database: State<'_, Database>, id: i64) -> Result<Option<Meeting>, String> {
    database.run(|connection| meetings::get(connection, id))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn update_meeting(
    database: State<'_, Database>,
    id: i64,
    name: &str,
    date: &str,
    notes: &str,
) -> Result<Meeting, String> {
    database.run(|connection| meetings::update(connection, id, name, date, notes))
}
```

Replace the `invoke_handler` line with:

```rust
        .invoke_handler(tauri::generate_handler![
            list_meetings,
            create_meeting,
            get_meeting,
            update_meeting
        ])
```

Run: `bun run fmt:rust && bun run lint:rust && bun run test:rust`
Expected: no warnings, and all tests pass.

- [ ] **Step 4: Commit the backend**

```bash
git add src-tauri
git commit -m "Add commands to create, get, and update meetings"
git push
```

- [ ] **Step 5: Write the failing library tests**

In `src/lib/dates.test.ts`, change the import to `import { formatMeetingDate, toMeetingDate } from "./dates";` and add:

```ts
describe("toMeetingDate", () => {
    it("uses the local calendar date", () => {
        expect(toMeetingDate(new Date(2026, 8, 24, 23, 59))).toBe("2026-09-24");
        expect(toMeetingDate(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
    });
});
```

Replace the contents of `src/lib/meetings.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createMeeting,
    displayName,
    getMeeting,
    listMeetings,
    updateMeeting,
} from "./meetings";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
});

describe("meeting commands", () => {
    it("calls the backend commands with their arguments", async () => {
        await listMeetings();
        await createMeeting("2026-09-24");
        await getMeeting(3);
        await updateMeeting(3, {
            name: "Weekly sync",
            date: "2026-09-25",
            notes: "- [ ] Send notes",
        });

        expect(invoke.mock.calls).toEqual([
            ["list_meetings"],
            ["create_meeting", { date: "2026-09-24" }],
            ["get_meeting", { id: 3 }],
            [
                "update_meeting",
                {
                    id: 3,
                    name: "Weekly sync",
                    date: "2026-09-25",
                    notes: "- [ ] Send notes",
                },
            ],
        ]);
    });
});

describe("displayName", () => {
    it("shows the default name for an empty or blank name", () => {
        expect(displayName("")).toBe("Untitled meeting");
        expect(displayName("   ")).toBe("Untitled meeting");
        expect(displayName("Weekly sync")).toBe("Weekly sync");
    });
});
```

Run: `bun run test src/lib`
Expected: FAIL, because `toMeetingDate`, `createMeeting`, `getMeeting`, and `updateMeeting` do not exist.

- [ ] **Step 6: Implement the library additions**

Add to the top of `src/lib/dates.ts`:

```ts
/**
 * Returns the calendar date of `now` in the local time zone, in the format `YYYY-MM-DD`.
 */
export function toMeetingDate(now: Date): string {
    const year = String(now.getFullYear()).padStart(4, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
```

Replace the contents of `src/lib/meetings.ts` with:

```ts
import { invoke } from "@tauri-apps/api/core";

/** One meeting, with its notes. The backend type is `Meeting` in `src-tauri/src/meetings.rs`. */
export type Meeting = {
    id: number;
    name: string;
    /** The calendar date of the meeting, in the format `YYYY-MM-DD`. */
    date: string;
    /** The notes, as Markdown. */
    notes: string;
    /** The time when the meeting was created, as an RFC 3339 timestamp in UTC. */
    createdAt: string;
    /** The time when the meeting was last changed, as an RFC 3339 timestamp in UTC. */
    updatedAt: string;
};

/** The part of a meeting that the list of meetings shows. */
export type MeetingSummary = Pick<Meeting, "id" | "name" | "date" | "updatedAt">;

/** The fields of a meeting that the user can change. */
export type MeetingChanges = Pick<Meeting, "name" | "date" | "notes">;

/** The name that the backend gives a new meeting. Also shown for a meeting with an empty name. */
export const DEFAULT_MEETING_NAME = "Untitled meeting";

/** Returns summaries of all meetings, with the newest date first. */
export function listMeetings(): Promise<MeetingSummary[]> {
    return invoke<MeetingSummary[]>("list_meetings");
}

/** Creates a meeting with the default name and empty notes on the given date (`YYYY-MM-DD`). */
export function createMeeting(date: string): Promise<Meeting> {
    return invoke<Meeting>("create_meeting", { date });
}

/** Returns the meeting with the given identifier, or `null` if it does not exist. */
export function getMeeting(id: number): Promise<Meeting | null> {
    return invoke<Meeting | null>("get_meeting", { id });
}

/** Replaces the name, date, and notes of a meeting and returns the stored meeting. */
export function updateMeeting(
    id: number,
    changes: MeetingChanges,
): Promise<Meeting> {
    return invoke<Meeting>("update_meeting", { id, ...changes });
}

/** Returns the name to show for a meeting. A meeting with an empty name shows the default name. */
export function displayName(name: string): string {
    return name.trim() === "" ? DEFAULT_MEETING_NAME : name;
}
```

Run: `bun run test src/lib`
Expected: PASS.

- [ ] **Step 7: Write the failing autosave tests**

Create `src/features/meetings/use-autosave.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "./use-autosave";

type Draft = { text: string };

/** A save function whose calls stay in progress until the test settles them. */
function controlledSave() {
    const calls: { value: Draft; resolve: () => void; reject: () => void }[] =
        [];
    const save = vi.fn(
        (value: Draft) =>
            new Promise<void>((resolve, reject) => {
                calls.push({
                    value,
                    resolve,
                    reject: () => reject(new Error("failed")),
                });
            }),
    );
    return { save, calls };
}

function renderAutosave(save: (value: Draft) => Promise<unknown>) {
    return renderHook(({ value }) => useAutosave(value, save, 500), {
        initialProps: { value: { text: "initial" } },
    });
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useAutosave", () => {
    it("does not save the first value", () => {
        const { save } = controlledSave();
        const { result } = renderAutosave(save);

        act(() => vi.advanceTimersByTime(1000));

        expect(save).not.toHaveBeenCalled();
        expect(result.current.status).toBe("idle");
    });

    it("saves once, with the latest value, after the user pauses", async () => {
        const { save, calls } = controlledSave();
        const { result, rerender } = renderAutosave(save);

        rerender({ value: { text: "a" } });
        act(() => vi.advanceTimersByTime(300));
        rerender({ value: { text: "ab" } });
        act(() => vi.advanceTimersByTime(300));
        expect(save).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(200));
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenLastCalledWith({ text: "ab" });
        expect(result.current.status).toBe("saving");

        await act(async () => calls[0].resolve());
        expect(result.current.status).toBe("saved");
    });

    it("runs one save at a time and then saves changes made during it", async () => {
        const { save, calls } = controlledSave();
        const { result, rerender } = renderAutosave(save);

        rerender({ value: { text: "first" } });
        act(() => vi.advanceTimersByTime(500));
        rerender({ value: { text: "second" } });
        act(() => vi.advanceTimersByTime(500));
        expect(save).toHaveBeenCalledTimes(1);

        await act(async () => calls[0].resolve());
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith({ text: "second" });
        expect(result.current.status).toBe("saving");

        await act(async () => calls[1].resolve());
        expect(result.current.status).toBe("saved");
    });

    it("reports a failed save, keeps the change, and saves it again on retry", async () => {
        const { save, calls } = controlledSave();
        const { result, rerender } = renderAutosave(save);

        rerender({ value: { text: "unsaved" } });
        act(() => vi.advanceTimersByTime(500));
        await act(async () => calls[0].reject());
        expect(result.current.status).toBe("error");

        act(() => result.current.retry());
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith({ text: "unsaved" });
        await act(async () => calls[1].resolve());
        expect(result.current.status).toBe("saved");
    });

    it("tries again on the next change after a failed save", async () => {
        const { save, calls } = controlledSave();
        const { rerender } = renderAutosave(save);

        rerender({ value: { text: "a" } });
        act(() => vi.advanceTimersByTime(500));
        await act(async () => calls[0].reject());

        rerender({ value: { text: "ab" } });
        act(() => vi.advanceTimersByTime(500));
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith({ text: "ab" });
    });

    it("saves a waiting change immediately on unmount", () => {
        const { save } = controlledSave();
        const { rerender, unmount } = renderAutosave(save);

        rerender({ value: { text: "leaving" } });
        unmount();

        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenLastCalledWith({ text: "leaving" });
    });

    it("saves a change made during a save after unmount, when that save finishes", async () => {
        const { save, calls } = controlledSave();
        const { rerender, unmount } = renderAutosave(save);

        rerender({ value: { text: "first" } });
        act(() => vi.advanceTimersByTime(500));
        rerender({ value: { text: "second" } });
        unmount();
        expect(save).toHaveBeenCalledTimes(1);

        await act(async () => calls[0].resolve());
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith({ text: "second" });
    });

    it("does not save on unmount when nothing changed", () => {
        const { save } = controlledSave();
        const { unmount } = renderAutosave(save);

        unmount();

        expect(save).not.toHaveBeenCalled();
    });
});
```

Run: `bun run test src/features/meetings/use-autosave.test.ts`
Expected: FAIL, because `./use-autosave` does not exist.

- [ ] **Step 8: Implement `useAutosave`**

Create `src/features/meetings/use-autosave.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

/** The time to wait after the last change before a save starts, in milliseconds. */
export const AUTOSAVE_DELAY_MS = 500;

/**
 * The state of automatic saving:
 * - `idle`: no change was made yet.
 * - `saving`: a save is in progress.
 * - `saved`: the last save finished and no newer change is waiting.
 * - `error`: the last save failed. The change is kept and is saved on the next change or retry.
 */
export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Saves `value` automatically when it changes.
 *
 * - The save starts `delay` milliseconds after the last change.
 * - Only one save runs at a time. Changes made during a save are saved when it finishes.
 * - The value that the component first gives is not saved.
 * - When the component unmounts, a change that is waiting is saved immediately.
 *
 * Give a new value (a new object) for each change. Values are compared with `Object.is`.
 */
export function useAutosave<T>(
    value: T,
    save: (value: T) => Promise<unknown>,
    delay: number = AUTOSAVE_DELAY_MS,
): { status: AutosaveStatus; retry: () => void } {
    const [status, setStatus] = useState<AutosaveStatus>("idle");
    const latest = useRef(value);
    const saveRef = useRef(save);
    const dirty = useRef(false);
    const inFlight = useRef(false);
    const mounted = useRef(true);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        saveRef.current = save;
    }, [save]);

    const flush = useCallback(async (): Promise<void> => {
        clearTimeout(timer.current);
        timer.current = undefined;
        if (inFlight.current || !dirty.current) return;

        inFlight.current = true;
        // Changes made while a save is in progress are saved by the next pass of the loop.
        while (dirty.current) {
            dirty.current = false;
            if (mounted.current) setStatus("saving");
            try {
                await saveRef.current(latest.current);
            } catch {
                // Keep the change so that the next change or a retry saves it again.
                dirty.current = true;
                inFlight.current = false;
                if (mounted.current) setStatus("error");
                return;
            }
        }
        inFlight.current = false;
        if (mounted.current) setStatus("saved");
    }, []);

    useEffect(() => {
        if (Object.is(value, latest.current)) return;
        latest.current = value;
        dirty.current = true;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), delay);
    }, [value, delay, flush]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            void flush();
        };
    }, [flush]);

    const retry = useCallback(() => {
        void flush();
    }, [flush]);

    return { status, retry };
}
```

Notes for the implementer:
- `flush` uses a loop instead of calling itself, because the `react-hooks/immutability` lint rule rejects a callback that refers to itself before it is declared.
- The first value is skipped by comparing with `latest.current`, not with a "first render" flag. React's development mode (`StrictMode`) runs effects twice when a component mounts, and a flag would make the second run save the unchanged value.

Run: `bun run test src/features/meetings/use-autosave.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 9: Commit the hook**

```bash
bun run fmt
git add src/lib src/features/meetings/use-autosave.ts src/features/meetings/use-autosave.test.ts
git commit -m "Add the meeting command wrappers and the autosave hook"
git push
```

- [ ] **Step 10: Write the failing editor page tests**

Create `src/features/meetings/meeting-editor-page.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { Meeting } from "@/lib/meetings";
import { MeetingEditorPage } from "./meeting-editor-page";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const MEETING: Meeting = {
    id: 42,
    name: "Weekly sync",
    date: "2026-09-24",
    notes: "",
    createdAt: "2026-09-24T17:00:00.000Z",
    updatedAt: "2026-09-24T17:00:00.000Z",
};

/** Makes the fake backend return MEETING and accept every update. */
function serveMeeting() {
    invoke.mockImplementation(
        async (command: string, args?: Record<string, unknown>) =>
            command === "get_meeting" ? MEETING : { ...MEETING, ...args },
    );
}

function renderPage(path: string) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <SidebarProvider>
                <Routes>
                    <Route path="/meetings" element={<p>Meetings list</p>} />
                    <Route
                        path="/meetings/:id"
                        element={<MeetingEditorPage />}
                    />
                </Routes>
            </SidebarProvider>
        </MemoryRouter>,
    );
}

function updates() {
    return invoke.mock.calls.filter(([command]) => command === "update_meeting");
}

beforeEach(() => {
    invoke.mockReset();
});

describe("MeetingEditorPage", () => {
    it("says that a meeting does not exist and links back to the list", async () => {
        invoke.mockResolvedValue(null);
        const user = userEvent.setup();
        renderPage("/meetings/42");

        expect(
            await screen.findByText(/This meeting doesn't exist/),
        ).toBeInTheDocument();
        expect(invoke).toHaveBeenCalledWith("get_meeting", { id: 42 });

        await user.click(
            screen.getByRole("link", { name: "Back to Meetings" }),
        );
        expect(screen.getByText("Meetings list")).toBeInTheDocument();
    });

    it("shows an error with a Retry button when the meeting cannot be loaded", async () => {
        invoke.mockRejectedValueOnce("database is locked");
        invoke.mockResolvedValueOnce(MEETING);
        const user = userEvent.setup();
        renderPage("/meetings/42");

        await user.click(await screen.findByRole("button", { name: "Retry" }));

        expect(
            await screen.findByRole("textbox", { name: "Meeting name" }),
        ).toHaveValue("Weekly sync");
    });

    it("shows Untitled meeting in the breadcrumb when the name is empty", async () => {
        serveMeeting();
        const user = userEvent.setup();
        renderPage("/meetings/42");

        await user.clear(
            await screen.findByRole("textbox", { name: "Meeting name" }),
        );

        expect(
            screen.getByRole("navigation", { name: "breadcrumb" }),
        ).toHaveTextContent("Untitled meeting");
    });

    it("keeps the last complete date when the date field is cleared", async () => {
        serveMeeting();
        renderPage("/meetings/42");
        const date = await screen.findByLabelText("Meeting date");

        fireEvent.change(date, { target: { value: "" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Meeting name" }), {
            target: { value: "Renamed" },
        });

        await waitFor(
            () =>
                expect(invoke).toHaveBeenCalledWith(
                    "update_meeting",
                    expect.objectContaining({
                        name: "Renamed",
                        date: "2026-09-24",
                    }),
                ),
            { timeout: 2000 },
        );
        expect(date).toHaveValue("2026-09-24");
        expect(
            updates().every(([, args]) => (args as Meeting).date !== ""),
        ).toBe(true);
    });

    it("carries the stored notes along unchanged when the name changes", async () => {
        invoke.mockImplementation(
            async (command: string, args?: Record<string, unknown>) =>
                command === "get_meeting"
                    ? { ...MEETING, notes: "- [ ] Send notes\n" }
                    : { ...MEETING, ...args },
        );
        const user = userEvent.setup();
        renderPage("/meetings/42");

        await user.type(
            await screen.findByRole("textbox", { name: "Meeting name" }),
            "!",
        );

        await waitFor(
            () =>
                expect(invoke).toHaveBeenCalledWith("update_meeting", {
                    id: 42,
                    name: "Weekly sync!",
                    date: "2026-09-24",
                    notes: "- [ ] Send notes\n",
                }),
            { timeout: 2000 },
        );
        expect(await screen.findByText("Saved")).toBeInTheDocument();
    });
});
```

Run: `bun run test src/features/meetings/meeting-editor-page.test.tsx`
Expected: FAIL, because `./meeting-editor-page` does not exist.

- [ ] **Step 11: Implement the save status**

Create `src/features/meetings/save-status.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import type { AutosaveStatus } from "./use-autosave";

const LABELS: Record<AutosaveStatus, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Couldn't save",
};

/** Shows the state of automatic saving. After a failed save, it also shows a Retry button. */
export function SaveStatus({
    status,
    onRetry,
}: {
    status: AutosaveStatus;
    onRetry: () => void;
}) {
    return (
        <div className="flex items-center gap-2 text-sm">
            <span
                role="status"
                className={
                    status === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                }
            >
                {LABELS[status]}
            </span>
            {status === "error" && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                    Retry
                </Button>
            )}
        </div>
    );
}
```

- [ ] **Step 12: Implement the meeting editor, without the notes editor**

Create `src/features/meetings/meeting-editor.tsx`. The draft includes the notes, so each save sends the stored notes back unchanged. Task 4 adds the notes editor.

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import {
    displayName,
    updateMeeting,
    type Meeting,
    type MeetingChanges,
} from "@/lib/meetings";
import { SaveStatus } from "./save-status";
import { useAutosave } from "./use-autosave";

/**
 * The editor for one meeting: its name, its date, and its notes. Changes are saved
 * automatically. If `isNew` is true, the name field gets the focus and its text is
 * selected.
 */
export function MeetingEditor({
    meeting,
    isNew,
}: {
    meeting: Meeting;
    isNew: boolean;
}) {
    const [draft, setDraft] = useState<MeetingChanges>({
        name: meeting.name,
        date: meeting.date,
        notes: meeting.notes,
    });
    const save = useCallback(
        (changes: MeetingChanges) => updateMeeting(meeting.id, changes),
        [meeting.id],
    );
    const { status, retry } = useAutosave(draft, save);
    const nameInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isNew) return;
        // `select()` alone does not move the focus to the field.
        nameInput.current?.focus();
        nameInput.current?.select();
    }, [isNew]);

    return (
        <>
            <PageHeader
                crumbs={[
                    { label: "Meetings", to: "/meetings" },
                    { label: displayName(draft.name) },
                ]}
            >
                <SaveStatus status={status} onRetry={retry} />
            </PageHeader>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                <div className="flex items-center gap-2">
                    <Input
                        ref={nameInput}
                        aria-label="Meeting name"
                        value={draft.name}
                        placeholder={displayName("")}
                        onChange={(event) => {
                            const name = event.target.value;
                            setDraft((current) => ({ ...current, name }));
                        }}
                        className="h-auto border-none px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
                    />
                    <Input
                        type="date"
                        aria-label="Meeting date"
                        value={draft.date}
                        required
                        onChange={(event) => {
                            const date = event.target.value;
                            // An empty value means the date is incomplete. Keep the last
                            // complete date, because the backend accepts only real dates.
                            if (date === "") return;
                            setDraft((current) => ({ ...current, date }));
                        }}
                        className="w-auto"
                    />
                </div>
            </div>
        </>
    );
}
```

- [ ] **Step 13: Implement the editor page**

Create `src/features/meetings/meeting-editor-page.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getMeeting, type Meeting } from "@/lib/meetings";
import { MeetingEditor } from "./meeting-editor";
import type { NewMeetingState } from "./meetings-page";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "not-found" }
    | { kind: "loaded"; meeting: Meeting };

/** The page that loads one meeting, by the identifier in the route, and shows its editor. */
export function MeetingEditorPage() {
    const { id } = useParams();
    const location = useLocation();
    const isNew = (location.state as NewMeetingState | null)?.isNew === true;

    // The key gives each meeting a new loader and editor, so that the editor of one
    // meeting saves its changes before the editor of the next meeting opens.
    return <MeetingLoader key={id} id={Number(id)} isNew={isNew} />;
}

function MeetingLoader({ id, isNew }: { id: number; isNew: boolean }) {
    const [load, setLoad] = useState<LoadState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let current = true;
        getMeeting(id).then(
            (meeting) => {
                if (!current) return;
                setLoad(
                    meeting ? { kind: "loaded", meeting } : { kind: "not-found" },
                );
            },
            () => current && setLoad({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [id, attempt]);

    if (load.kind === "loaded") {
        return <MeetingEditor meeting={load.meeting} isNew={isNew} />;
    }

    return (
        <>
            <PageHeader crumbs={[{ label: "Meetings", to: "/meetings" }]} />
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0 text-sm">
                {load.kind === "loading" && (
                    <p className="text-muted-foreground">Loading…</p>
                )}
                {load.kind === "not-found" && (
                    <p>
                        This meeting doesn't exist.{" "}
                        <Link to="/meetings" className="underline">
                            Back to Meetings
                        </Link>
                    </p>
                )}
                {load.kind === "error" && (
                    <div className="flex items-center gap-2">
                        <p>Couldn't load this meeting</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setLoad({ kind: "loading" });
                                setAttempt((value) => value + 1);
                            }}
                        >
                            Retry
                        </Button>
                    </div>
                )}
            </div>
        </>
    );
}
```

This file imports `NewMeetingState` from `meetings-page.tsx`, which Step 15 adds. Run the tests after Step 15.

- [ ] **Step 14: Write the failing Meetings page tests for "New note"**

Add these tests inside the `describe` block of `src/features/meetings/meetings-page.test.tsx`:

```tsx
    it("reports a failed creation and lets the user try again", async () => {
        invoke.mockImplementation(async (command: string) => {
            if (command === "list_meetings") return [];
            throw "disk I/O error";
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", { name: "New note" }),
        );

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Couldn't create a note",
        );
        expect(screen.getByRole("button", { name: "New note" })).toBeEnabled();
    });

    it("creates only one meeting when New note is clicked twice", async () => {
        invoke.mockImplementation((command: string) =>
            command === "list_meetings"
                ? Promise.resolve([])
                : new Promise(() => {}),
        );
        const user = userEvent.setup();
        renderPage();
        const button = await screen.findByRole("button", { name: "New note" });

        await user.click(button);
        await user.click(button);

        expect(
            invoke.mock.calls.filter(([command]) => command === "create_meeting"),
        ).toHaveLength(1);
    });
```

- [ ] **Step 15: Add "New note" to the Meetings page and the editor route**

Replace the contents of `src/features/meetings/meetings-page.tsx` with:

```tsx
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatMeetingDate, toMeetingDate } from "@/lib/dates";
import {
    createMeeting,
    displayName,
    listMeetings,
    type MeetingSummary,
} from "@/lib/meetings";

type ListState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; meetings: MeetingSummary[] };

/** State that the Meetings page gives the editor page when it opens a new meeting. */
export type NewMeetingState = { isNew: true };

/** The page that lists all meetings and creates new ones. */
export function MeetingsPage() {
    const navigate = useNavigate();
    const [list, setList] = useState<ListState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [creating, setCreating] = useState(false);
    const [createFailed, setCreateFailed] = useState(false);

    useEffect(() => {
        let current = true;
        listMeetings().then(
            (meetings) => current && setList({ kind: "loaded", meetings }),
            () => current && setList({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt]);

    function retry() {
        setList({ kind: "loading" });
        setAttempt((value) => value + 1);
    }

    async function createNote() {
        setCreating(true);
        setCreateFailed(false);
        try {
            const meeting = await createMeeting(toMeetingDate(new Date()));
            const state: NewMeetingState = { isNew: true };
            navigate(`/meetings/${meeting.id}`, { state });
        } catch {
            setCreateFailed(true);
            setCreating(false);
        }
    }

    return (
        <>
            <PageHeader crumbs={[{ label: "Meetings" }]}>
                <Button onClick={createNote} disabled={creating}>
                    <PlusIcon />
                    New note
                </Button>
            </PageHeader>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                {createFailed && (
                    <p role="alert" className="text-sm text-destructive">
                        Couldn't create a note. Try again.
                    </p>
                )}
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
        </>
    );
}
```

The "lists meetings…" test from Task 2 counts every link on the page. The new "New note" control is a button and the Meetings breadcrumb is the current page, not a link, so that count is still 2.

In `src/App.tsx`, import `MeetingEditorPage` and add its route after the `/meetings` route:

```tsx
import { MeetingEditorPage } from "@/features/meetings/meeting-editor-page";
```

```tsx
                            <Route
                                path="/meetings/:id"
                                element={<MeetingEditorPage />}
                            />
```

- [ ] **Step 16: Run the tests to verify that they pass**

Run: `bun run fmt && bunx vitest run --exclude "src/**/*.spec.tsx"`
Expected: PASS.

- [ ] **Step 17: Run the task check and commit**

Run the task check from Global Constraints. Expected: all commands succeed. In the feature spec, these scenarios now also pass: "shows an empty Meetings page…", "creates an untitled meeting dated today…", "autosaves the meeting name and date…", and "returns to the Meetings page from the sidebar". The scenarios about notes still fail.

```bash
git add -A
git commit -m "Create meetings and autosave their name and date"
git push
```

---

### Task 4: Write notes in a rich text editor

The editor page gets the TipTap notes editor with a formatting toolbar. The notes are shown from Markdown and saved as Markdown. After this task, the complete feature spec passes.

**Files:**
- Create: `src/features/meetings/notes-editor.tsx`, `src/features/meetings/notes-editor.test.tsx`
- Generated by shadcn: `src/components/ui/toggle.tsx`
- Modify: `src/features/meetings/meeting-editor.tsx`, `src/test/setup.ts`, `src/index.css`, `package.json`, `bun.lock`, `CLAUDE.md`

**Interfaces:**
- Consumes: `MeetingEditor` and its `draft` state from Task 3.
- Produces: `NotesEditor({ initialMarkdown: string; onChange: (markdown: string) => void })`. The editable area has the role `textbox`, the label "Notes", and `aria-multiline="true"`. The toolbar is `role="toolbar"`, labeled "Formatting", and has toggle buttons labeled "Bold", "Italic", "Heading", "Bullet list", "Numbered list", and "Task list".

- [ ] **Step 1: Install the editor and the toggle component**

```bash
bun add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-list @tiptap/markdown @tailwindcss/typography
bunx --bun shadcn@latest add toggle --yes
bun run fmt
```

- [ ] **Step 2: Stub the layout APIs that the editor needs**

TipTap is built on ProseMirror, which measures text positions when it reads the selection. jsdom does not implement these measurements, and without the stubs, typing into the editor in tests does not reach the document. Add to the end of `src/test/setup.ts`:

```ts
// The editor measures text positions when it scrolls to or reads the selection.
Range.prototype.getClientRects = () =>
    ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
document.elementFromPoint = () => null;
```

- [ ] **Step 3: Write the failing notes editor tests**

Create `src/features/meetings/notes-editor.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesEditor } from "./notes-editor";

describe("NotesEditor", () => {
    it("shows Markdown as formatted text", async () => {
        render(
            <NotesEditor
                initialMarkdown={"## Agenda\n\n**Owner:** Sam\n\n1. Roadmap\n"}
                onChange={() => {}}
            />,
        );
        const notes = await screen.findByRole("textbox", { name: "Notes" });

        expect(
            within(notes).getByRole("heading", { level: 2, name: "Agenda" }),
        ).toBeInTheDocument();
        expect(within(notes).getByText("Owner:").tagName).toBe("STRONG");
        expect(within(notes).getByRole("listitem")).toHaveTextContent(
            "Roadmap",
        );
    });

    it("reports the notes as Markdown after typing", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<NotesEditor initialMarkdown="" onChange={onChange} />);

        await user.type(
            await screen.findByRole("textbox", { name: "Notes" }),
            "Hello",
        );

        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("Hello"));
    });

    it.each([
        ["Bold", "**Decision**"],
        ["Heading", "## Decision"],
        ["Bullet list", "- Decision"],
        ["Numbered list", "1. Decision"],
        ["Task list", "- [ ] Decision"],
    ])("applies %s from the toolbar", async (label, markdown) => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<NotesEditor initialMarkdown="" onChange={onChange} />);
        await user.click(await screen.findByRole("textbox", { name: "Notes" }));

        await user.click(screen.getByRole("button", { name: label }));
        await user.keyboard("Decision");

        await waitFor(() =>
            expect(onChange.mock.lastCall?.[0].trim()).toBe(markdown),
        );
        expect(screen.getByRole("button", { name: label })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });
});
```

The toolbar tests type with `user.keyboard` instead of `user.type`, because `user.type` clicks the element first, and that click moves the cursor out of the new list or heading in jsdom.

Run: `bun run test src/features/meetings/notes-editor.test.tsx`
Expected: FAIL, because `./notes-editor` does not exist.

- [ ] **Step 4: Implement the notes editor**

Create `src/features/meetings/notes-editor.tsx`:

```tsx
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import {
    EditorContent,
    useEditor,
    useEditorState,
    type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
    BoldIcon,
    Heading2Icon,
    ItalicIcon,
    ListChecksIcon,
    ListIcon,
    ListOrderedIcon,
    type LucideIcon,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

/** A formatting button in the toolbar. */
type ToolbarItem = {
    label: string;
    icon: LucideIcon;
    isActive: (editor: Editor) => boolean;
    run: (editor: Editor) => void;
};

const TOOLBAR: ToolbarItem[] = [
    {
        label: "Bold",
        icon: BoldIcon,
        isActive: (editor) => editor.isActive("bold"),
        run: (editor) => editor.chain().focus().toggleBold().run(),
    },
    {
        label: "Italic",
        icon: ItalicIcon,
        isActive: (editor) => editor.isActive("italic"),
        run: (editor) => editor.chain().focus().toggleItalic().run(),
    },
    {
        label: "Heading",
        icon: Heading2Icon,
        isActive: (editor) => editor.isActive("heading", { level: 2 }),
        run: (editor) =>
            editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
        label: "Bullet list",
        icon: ListIcon,
        isActive: (editor) => editor.isActive("bulletList"),
        run: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
        label: "Numbered list",
        icon: ListOrderedIcon,
        isActive: (editor) => editor.isActive("orderedList"),
        run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
        label: "Task list",
        icon: ListChecksIcon,
        isActive: (editor) => editor.isActive("taskList"),
        run: (editor) => editor.chain().focus().toggleTaskList().run(),
    },
];

/**
 * A rich text editor for meeting notes. It reads and writes Markdown.
 *
 * `initialMarkdown` is read only when the editor is created. To show a different note,
 * give the component a different `key`. `onChange` receives the notes as Markdown after
 * each change.
 */
export function NotesEditor({
    initialMarkdown,
    onChange,
}: {
    initialMarkdown: string;
    onChange: (markdown: string) => void;
}) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            TaskList,
            TaskItem.configure({ nested: true }),
            Markdown,
        ],
        content: initialMarkdown,
        contentType: "markdown",
        editorProps: {
            attributes: {
                role: "textbox",
                "aria-label": "Notes",
                "aria-multiline": "true",
                class: "notes-editor prose prose-sm dark:prose-invert max-w-none min-h-64 focus:outline-none",
            },
        },
        onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
    });

    const active = useEditorState({
        editor,
        selector: ({ editor }) =>
            TOOLBAR.map((item) => (editor ? item.isActive(editor) : false)),
    });

    return (
        <div className="flex flex-col gap-2">
            <div
                role="toolbar"
                aria-label="Formatting"
                className="flex flex-wrap gap-1 border-b pb-2"
            >
                {TOOLBAR.map((item, index) => (
                    <Toggle
                        key={item.label}
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
                ))}
            </div>
            <EditorContent editor={editor} />
        </div>
    );
}
```

The `onMouseDown` handler matters. Without it, a click moves the focus to the button, TipTap moves it back a moment later, and keys typed in between are lost. The tests for Bold, Heading, Bullet list, and Numbered list fail without it.

Run: `bun run test src/features/meetings/notes-editor.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Style the notes**

Tailwind's base styles remove the default look of headings and lists, so the notes need the typography plugin and styles for task lists. In `src/index.css`, add after the `@import` lines:

```css
@plugin "@tailwindcss/typography";
```

Add to the end of `src/index.css`:

```css
@layer components {
    .notes-editor ul[data-type="taskList"] {
        list-style: none;
        padding-left: 0;
    }

    .notes-editor ul[data-type="taskList"] li {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
    }

    .notes-editor ul[data-type="taskList"] li > label {
        flex-shrink: 0;
        margin-top: 0.3em;
    }

    .notes-editor ul[data-type="taskList"] li > div {
        flex: 1;
    }

    .notes-editor ul[data-type="taskList"] li > div > p {
        margin: 0;
    }

    .notes-editor ul[data-type="taskList"] li[data-checked="true"] > div {
        color: var(--muted-foreground);
        text-decoration: line-through;
    }
}
```

- [ ] **Step 6: Add the notes editor to the meeting editor**

In `src/features/meetings/meeting-editor.tsx`, add the import:

```tsx
import { NotesEditor } from "./notes-editor";
```

Add this callback after the `useEffect` block. It must be stable, because the editor keeps the first `onChange` that it gets:

```tsx
    const changeNotes = useCallback(
        (notes: string) => setDraft((current) => ({ ...current, notes })),
        [],
    );
```

Add the notes editor after the `<div>` that contains the name and date fields, inside the outer `<div className="flex flex-1 flex-col gap-4 p-4 pt-0">`:

```tsx
                <NotesEditor
                    initialMarkdown={meeting.notes}
                    onChange={changeNotes}
                />
```

- [ ] **Step 7: Run the feature spec**

Run: `bun run fmt && bunx vitest run src/features/meetings/meetings.spec.tsx`
Expected: PASS (10 tests). Run it three times to check that no test is flaky.

- [ ] **Step 8: Update CLAUDE.md**

Under "Testing conventions", extend the sentence about `src/test/setup.ts` stubs so that it also names `Range.getClientRects`, `Range.getBoundingClientRect`, and `document.elementFromPoint`, which the TipTap editor needs. Add: "To type into the TipTap editor after a toolbar click in a test, use `user.keyboard`, because `user.type` clicks the element first and moves the cursor."

- [ ] **Step 9: Run the full check and commit**

Run: `bun run check`
Expected: every command succeeds, including the feature spec.

```bash
git add -A
git commit -m "Write meeting notes in a rich text editor"
git push
```

- [ ] **Step 10: Ask a human to check the application**

The tests run in jsdom, which does not show layout or styles. Ask a human to run `bun run tauri dev` and confirm:

1. The window opens at 1200 by 800 pixels, with the floating sidebar and the Meetings page.
2. "New note" opens a meeting with "Untitled meeting" selected, and typing replaces it.
3. Headings, bold text, lists, and task lists look formatted, and task items have working check boxes.
4. After the application is closed and opened again, the meeting and its notes are still there.
5. The file `gps.sqlite` exists in the application data directory (on macOS, `~/Library/Application Support/<identifier>/`, where the identifier is in `src-tauri/tauri.conf.json`).
