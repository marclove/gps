# Archive Meetings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user archive a meeting from the list of meetings or from its editor page, so that the meeting no longer appears in the list, and let them restore it at once with an "Undo" button.

**Architecture:** A new database migration adds a column `archived_at` to the `meetings` table. The column is empty for a meeting that is not archived. The backend leaves archived meetings out of `list_meetings` and gets two new commands, `archive_meeting` and `unarchive_meeting`. The frontend calls them through `src/lib/meetings.ts`. The Meetings page gets an archive button on each row and an archive notice with an "Undo" button. The editor page gets an "Archive" button that archives the meeting and opens the Meetings page, which then shows the same notice.

**Tech Stack:** Tauri 2, React 19, TypeScript, Tailwind CSS 4, shadcn `Button`, `lucide-react` icons, React Router (memory router), Rust with `rusqlite` and `rusqlite_migration`, Vitest with jsdom and with WebKit in browser mode.

**Spec:** `docs/specs/0004-archive-meeting-notes.md`, with the executable specs `src/features/meetings/archive.spec.tsx` and `src/features/meetings/archive.browser.spec.tsx`. The decision about storage is in `docs/adrs/0008-archive-meetings-with-a-timestamp.md`. The decision to show the archive notice as a toast, owned by a provider in `App.tsx`, is in `docs/adrs/0009-show-brief-notifications-as-toasts.md`. Tasks 1 to 3 built an inline notice on the Meetings page. Tasks 4 and 5 replace it with a toast. Read the spec and the ADR before you start a task.

## Background for a new engineer

- A **meeting** is one row in the `meetings` table. The Rust module `src-tauri/src/meetings.rs` contains all SQL for meetings. Its functions take a `&Connection` and return `Result<_, Error>`, where `Error::NotFound(id)` means that no meeting has the identifier. Tests in that file use `db::open_in_memory()`.
- Migrations are in the `MIGRATIONS` list in `src-tauri/src/db.rs`. Add to the end of the list. Never change the first migration.
- A backend command is a thin function in `src-tauri/src/lib.rs` that calls `database.run(...)` with a module function. It must also be added to `generate_handler!`.
- The Meetings page (`src/features/meetings/meetings-page.tsx`) loads the list with `listMeetings()` in an effect that runs again when `attempt` changes. The editor page (`meeting-editor.tsx`) saves changes automatically with `useAutosave`. When the editor unmounts, `useAutosave` saves any change that is still waiting. Archiving from the editor relies on this: it archives first and then navigates away, and the unmount saves the change.
- Text that the user sees must match the spec exactly, including the straight double quotes in `Archived "Standup".` and `Archive "Standup"`.

## Global Constraints

- Use Bun for every JavaScript command (`bun`, `bunx`). Do not use npm, yarn, or pnpm.
- Run `bun run fmt` after you change TypeScript files. Rust is linted by clippy with `clippy::pedantic`, and any warning fails.
- Document every exported TypeScript item and every public Rust item with a docstring in the ASD-STE100 standard: short sentences, active voice, simple words.
- Do not refer to sections of an ADR or of this plan in code comments or docstrings.
- Do not change `docs/features/`, the ADRs, the specs in `docs/specs/`, or any `*.spec.tsx` file. If one of them seems wrong, stop and ask a human.
- Exact user text: `Archive "<name>"` (accessible name of the row button), `Archive` (editor button), `Archived "<name>".` (notice), `Undo`, `Close` (toast close button), `Notifications` (accessible name of the toast region), `Couldn't archive the meeting. Try again.`, `Couldn't restore the meeting. Try again.`. `<name>` is `displayName(name)`, so an empty name is `Untitled meeting`.
- Commit after each task. Push each commit to the draft pull request with `git push`. Write the commit message as a short imperative summary line, a blank line, and a body that explains why. End it with the attribution lines that the orchestrating session gives you.
- The executable specs `archive.spec.tsx` and `archive.browser.spec.tsx` are expected to pass only in part until Task 3 is complete. Every other test must pass at the end of each task. At the end of each task, run the **task check**:

  ```bash
  bun run typecheck && bun run lint && bun run fmt:check \
    && bunx vitest run --exclude "src/features/meetings/archive*.spec.tsx" \
    && bun run fmt:rust:check && bun run lint:rust && bun run test:rust
  ```

  Expected: every command succeeds.

## Review Focus

These are the conditions most likely to hurt a real user that the feature spec does not test. Each one has a test in the task that owns the code.

1. **A failed archive is followed by a successful one.** The "Couldn't archive the meeting. Try again." message must disappear when the next archive succeeds, so the user does not see an error next to a success notice. (Task 1, `meetings-page.test.tsx`)
2. **A database created before this feature.** Meetings that exist when the new migration runs must stay in the list. (Task 1, `db.rs` tests)
3. **"Undo" is clicked twice quickly.** Only one `unarchive_meeting` call is made; the button is disabled while the restore is in progress. (Task 2, `meetings-page.test.tsx`)
4. **"Archive" in the editor is clicked twice quickly.** Only one `archive_meeting` call is made and the Meetings page opens once; the button is disabled while the archive is in progress. (Task 3, `meeting-editor-page.test.tsx`)
5. **The name was changed just before archiving from the editor.** The notice must show the name that the user typed, even if it was not yet saved. (Task 3, `meeting-editor-page.test.tsx`)

## File Structure

| File | Change |
| --- | --- |
| `src-tauri/src/db.rs` | Second migration: add `archived_at`. |
| `src-tauri/src/meetings.rs` | `list` leaves out archived meetings. New `archive` and `unarchive`. |
| `src-tauri/src/lib.rs` | Commands `archive_meeting` and `unarchive_meeting`. |
| `src/lib/meetings.ts` | `archiveMeeting`, `unarchiveMeeting`. |
| `src/features/meetings/meetings-page.tsx` | Archive button on each row, archive notice, "Undo", error messages. Reads a notice from the router location state. |
| `src/features/meetings/meeting-editor.tsx` | "Archive" button in the page header. |

---

### Task 1: Archive a meeting from the Meetings page

**Files:**
- Modify: `src-tauri/src/db.rs`, `src-tauri/src/meetings.rs`, `src-tauri/src/lib.rs`
- Modify: `src/lib/meetings.ts`, `src/lib/meetings.test.ts`
- Modify: `src/features/meetings/meetings-page.tsx`, `src/features/meetings/meetings-page.test.tsx`
- Test: `archive.spec.tsx` and `archive.browser.spec.tsx` (already written, do not change)

**Interfaces:**
- Produces (Rust): `pub fn archive(connection: &Connection, id: i64) -> Result<(), Error>` in `meetings.rs`. Command `archive_meeting(database, id: i64) -> Result<(), String>`.
- Produces (TypeScript): `archiveMeeting(id: number): Promise<void>` in `src/lib/meetings.ts`, which calls `invoke("archive_meeting", { id })`.
- Produces (TypeScript): in `meetings-page.tsx`, `export type ArchivedMeeting = { id: number; name: string }`, where `name` is already passed through `displayName`. The page keeps the notice in state as `ArchivedMeeting | null`. Tasks 2 and 3 use this type.

- [ ] **Step 1: Write the failing Rust tests**

In `db.rs` tests, add `migration_keeps_existing_meetings_in_the_list`: open an in-memory connection, apply only `&MIGRATIONS[..1]` with `Migrations::from_slice(...).to_latest`, insert one meeting row with SQL, then call `migrate`. Assert that `meetings::list` returns that meeting.

In `meetings.rs` tests, add:
- `list_leaves_out_archived_meetings`: create two meetings, archive one, and assert that `list` returns only the other one.
- `archive_keeps_name_date_notes_and_updated_at`: update a meeting with a name, a date, and notes, archive it, and assert that `get` returns the same `Meeting` as before the archive.
- `archive_twice_keeps_the_first_time`: archive a meeting, set `archived_at` to `'2026-01-01T00:00:00.000Z'` with SQL, archive again, and assert that the column still has that value.
- `archive_reports_unknown_id`: `archive(&connection, 42)` returns `Err(Error::NotFound(42))`.
- `update_changes_an_archived_meeting`: archive a meeting, then `update` it, and assert that `get` returns the new notes.

- [ ] **Step 2: Run the Rust tests to see them fail**

Run: `bun run test:rust`
Expected: compile error, because `archive` is not defined.

- [ ] **Step 3: Implement the migration, `archive`, the list filter, and the command**

- Add `M::up("ALTER TABLE meetings ADD COLUMN archived_at TEXT;")` to the end of `MIGRATIONS`.
- In `list`, add `WHERE archived_at IS NULL`, and update its docstring to say that archived meetings are left out.
- `archive` runs `UPDATE meetings SET archived_at = coalesce(archived_at, {NOW}) WHERE id = ?1` and returns `Error::NotFound(id)` when no row changed. It does not change `updated_at`.
- Add the command `archive_meeting` to `lib.rs` with the same `#[expect(clippy::needless_pass_by_value, ...)]` as the other commands, and add it to `generate_handler!`.

- [ ] **Step 4: Run the Rust tests to see them pass**

Run: `bun run test:rust && bun run lint:rust`
Expected: PASS, with no warnings.

- [ ] **Step 5: Write the failing frontend tests**

- In `meetings.test.ts`, add `archiveMeeting(3)` to the test "calls the backend commands with their arguments", and expect `["archive_meeting", { id: 3 }]`.
- In `meetings-page.test.tsx`, add `it("hides the error after a failed archive when the next archive succeeds")`. The fake returns two meetings, rejects the first `archive_meeting`, and resolves the second. Click `Archive "Weekly sync"`. Expect the text `Couldn't archive the meeting. Try again.`. Click the same button again. Expect `Archived "Weekly sync".`, and expect `queryByText("Couldn't archive the meeting. Try again.")` to be `null`.

- [ ] **Step 6: Run the frontend tests to see them fail**

Run: `bunx vitest run src/lib/meetings.test.ts src/features/meetings/meetings-page.test.tsx`
Expected: FAIL, because `archiveMeeting` is not exported and there is no archive button.

- [ ] **Step 7: Implement `archiveMeeting` and the archive button on each row**

- `archiveMeeting` in `src/lib/meetings.ts`, with a docstring.
- In `meetings-page.tsx`, each `<li>` becomes `className="group flex items-center gap-1 rounded-lg hover:bg-muted"`. The `hover:bg-muted` class moves from the `Link` to the `<li>`, and the `Link` gets `flex-1`. After the `Link`, add `<Button variant="ghost" size="icon-sm" aria-label={`Archive "${displayName(meeting.name)}"`}>` with `<ArchiveIcon />` from `lucide-react`. The button has the classes `opacity-0 group-hover:opacity-100 focus-visible:opacity-100`, so it is visible only on hover or keyboard focus, but it stays in the tab order.
- On click: call `archiveMeeting(meeting.id)`. When it succeeds, remove the meeting from the loaded list in state, set the notice to `{ id, name: displayName(meeting.name) }`, and clear the archive error. When it fails, set the archive error.
- Show the notice below the title, in the title area that holds the "Couldn't create a note" alert: `<p>Archived "{name}".</p>` inside a `<div role="status" className="flex items-center gap-2 text-sm">`. The `<p>` holds only that text, because Task 2 adds the "Undo" button next to it.
- Show the archive error as `<p role="alert" className="text-sm text-destructive">Couldn't archive the meeting. Try again.</p>`, in the same place as the "Couldn't create a note" alert.

- [ ] **Step 8: Run the tests and the executable specs of this task**

Run: `bunx vitest run src/lib/meetings.test.ts src/features/meetings/meetings-page.test.tsx`
Expected: PASS.
Run: `bunx vitest run src/features/meetings/archive.spec.tsx -t "from the Meetings page|archived meetings"`
Expected: PASS, except "removes the meeting from the list and offers Undo", which needs the "Undo" button of Task 2.
Run: `bunx vitest run --project browser src/features/meetings/archive.browser.spec.tsx`
Expected: PASS. If the hover test fails because Tailwind's `group-hover` applies only when the browser reports `(hover: hover)`, stop and report it rather than changing the spec.

- [ ] **Step 9: Run the task check and commit**

Run the task check. Expected: every command succeeds.

```bash
git add src-tauri/src src/lib/meetings.ts src/lib/meetings.test.ts src/features/meetings/meetings-page.tsx src/features/meetings/meetings-page.test.tsx
git commit -m "Archive a meeting from the Meetings page"
git push
```

---

### Task 2: Undo an archive

**Files:**
- Modify: `src-tauri/src/meetings.rs`, `src-tauri/src/lib.rs`
- Modify: `src/lib/meetings.ts`, `src/lib/meetings.test.ts`
- Modify: `src/features/meetings/meetings-page.tsx`, `src/features/meetings/meetings-page.test.tsx`

**Interfaces:**
- Consumes: `ArchivedMeeting` and the notice state from Task 1.
- Produces (Rust): `pub fn unarchive(connection: &Connection, id: i64) -> Result<(), Error>`. Command `unarchive_meeting(database, id: i64) -> Result<(), String>`.
- Produces (TypeScript): `unarchiveMeeting(id: number): Promise<void>`, which calls `invoke("unarchive_meeting", { id })`.

- [ ] **Step 1: Write the failing Rust tests**

In `meetings.rs` tests, add:
- `unarchive_returns_the_meeting_to_the_list`: create two meetings on different dates, archive the newer one, unarchive it, and assert that `list` returns both in the usual order.
- `unarchive_reports_unknown_id`: `unarchive(&connection, 42)` returns `Err(Error::NotFound(42))`.

- [ ] **Step 2: Run them to see them fail**

Run: `bun run test:rust`
Expected: compile error, because `unarchive` is not defined.

- [ ] **Step 3: Implement `unarchive` and the command**

`unarchive` runs `UPDATE meetings SET archived_at = NULL WHERE id = ?1` and returns `Error::NotFound(id)` when no row changed. Add `unarchive_meeting` to `lib.rs` and to `generate_handler!`.

- [ ] **Step 4: Run the Rust tests to see them pass**

Run: `bun run test:rust && bun run lint:rust`
Expected: PASS.

- [ ] **Step 5: Write the failing frontend tests**

- In `meetings.test.ts`, add `unarchiveMeeting(3)` to the command test, and expect `["unarchive_meeting", { id: 3 }]`.
- In `meetings-page.test.tsx`, add `it("restores only once when Undo is clicked twice quickly")`. The fake keeps the `unarchive_meeting` promise pending until the test resolves it. Archive a meeting, click "Undo" twice, and expect exactly one `unarchive_meeting` call. Then resolve the promise and expect the notice to disappear.
- In `meetings-page.test.tsx`, add `it("hides the restore error when another meeting is archived")`. The first `unarchive_meeting` rejects. Archive "Standup", click "Undo", and expect `Couldn't restore the meeting. Try again.`. Archive "Kickoff". Expect `Archived "Kickoff".`, and expect the restore error to be gone.

- [ ] **Step 6: Run the frontend tests to see them fail**

Run: `bunx vitest run src/lib/meetings.test.ts src/features/meetings/meetings-page.test.tsx`
Expected: FAIL, because `unarchiveMeeting` is not exported and there is no "Undo" button.

- [ ] **Step 7: Implement `unarchiveMeeting` and the "Undo" button**

- `unarchiveMeeting` in `src/lib/meetings.ts`, with a docstring.
- In the notice, after the `<p>`, add `<Button variant="outline" size="sm">Undo</Button>`. It is disabled while the restore is in progress.
- On click: call `unarchiveMeeting(notice.id)`. When it succeeds, clear the notice and the restore error, and load the list again by incrementing `attempt`. Do not set the list to the loading state, so that the current list stays on screen until the new list arrives. When it fails, set the restore error and keep the notice.
- Show the restore error as `<p role="alert" className="text-sm text-destructive">Couldn't restore the meeting. Try again.</p>` next to the other alerts.
- A successful archive also clears the restore error, because the new notice replaces the old one.

- [ ] **Step 8: Run the tests and the executable specs of this task**

Run: `bunx vitest run src/lib/meetings.test.ts src/features/meetings/meetings-page.test.tsx`
Expected: PASS.
Run: `bunx vitest run src/features/meetings/archive.spec.tsx -t "Undo|from the Meetings page|archived meetings"`
Expected: PASS.

- [ ] **Step 9: Run the task check and commit**

Run the task check. Expected: every command succeeds.

```bash
git add src-tauri/src src/lib/meetings.ts src/lib/meetings.test.ts src/features/meetings/meetings-page.tsx src/features/meetings/meetings-page.test.tsx
git commit -m "Restore an archived meeting with Undo"
git push
```

---

### Task 3: Archive a meeting from its editor page

**Files:**
- Modify: `src/features/meetings/meeting-editor.tsx`, `src/features/meetings/meeting-editor-page.test.tsx`
- Modify: `src/features/meetings/meetings-page.tsx`, `src/features/meetings/meetings-page.test.tsx`

**Interfaces:**
- Consumes: `archiveMeeting` and `ArchivedMeeting` from Task 1, and the notice with "Undo" from Task 2.
- Produces: `export type MeetingsPageState = { archived: ArchivedMeeting }` in `meetings-page.tsx`. The editor passes it as the router location state when it opens the Meetings page, in the same way that the Meetings page passes `NewMeetingState` to the editor.

- [ ] **Step 1: Write the failing tests**

- In `meetings-page.test.tsx`, add `it("shows the archive notice that the location state gives")`. Render the page inside `<MemoryRouter initialEntries={[{ pathname: "/meetings", state: { archived: { id: 7, name: "Standup" } } }]}>`. Expect `Archived "Standup".` and an "Undo" button.
- In `meeting-editor-page.test.tsx`, change the `/meetings` route of `renderPage` so that its element shows the location state, for example a component that renders `<p>Meetings list {JSON.stringify(useLocation().state)}</p>`. Then add:
  - `it("archives once when Archive is clicked twice quickly")`: `archive_meeting` stays pending until the test resolves it. Click "Archive" twice, and expect one `archive_meeting` call with `{ id: 42 }`. Resolve it, and expect the Meetings list route.
  - `it("gives the Meetings page the name that the user typed")`: change the name field to "Retro" and click "Archive" before the save delay ends. Expect the Meetings list route to show the state `{"archived":{"id":42,"name":"Retro"}}`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `bunx vitest run src/features/meetings/meetings-page.test.tsx src/features/meetings/meeting-editor-page.test.tsx`
Expected: FAIL, because there is no "Archive" button and the Meetings page ignores the location state.

- [ ] **Step 3: Implement the "Archive" button and the notice from the location state**

- In `meetings-page.tsx`, read `useLocation().state` as `MeetingsPageState | null` and use `state?.archived ?? null` as the initial value of the notice state.
- In `meeting-editor.tsx`, add `<Button variant="outline" size="sm"><ArchiveIcon />Archive</Button>` to the `PageHeader` children, after `SaveStatus`. It is disabled while the archive is in progress. On click: call `archiveMeeting(meeting.id)`. When it succeeds, call `navigate("/meetings", { state })` with `state: MeetingsPageState = { archived: { id: meeting.id, name: displayName(draft.name) } }`. When it fails, enable the button again and show `<p role="alert" className="text-sm text-destructive">Couldn't archive the meeting. Try again.</p>` in the header, before `SaveStatus`.
- Do not wait for a pending save before archiving. The editor saves the change when it unmounts, and `update_meeting` works for archived meetings.

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run src/features/meetings/meetings-page.test.tsx src/features/meetings/meeting-editor-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full check, including every feature spec**

Run: `bun run check`
Expected: every command succeeds, including `archive.spec.tsx`, `archive.browser.spec.tsx`, and the specs of the earlier features.

- [ ] **Step 6: Commit**

```bash
git add src/features/meetings/meeting-editor.tsx src/features/meetings/meeting-editor-page.test.tsx src/features/meetings/meetings-page.tsx src/features/meetings/meetings-page.test.tsx
git commit -m "Archive a meeting from its editor page"
git push
```

## Manual verification

After Task 3, run `bun run tauri dev`. Create a meeting, archive it from the editor, and check that the Meetings page shows the notice and that "Undo" brings the meeting back. Archive a meeting from the list, quit the application, open it again, and check that the meeting is still hidden.

---

## Tasks 4 and 5: Show the archive notice as a toast

After Task 3, the notice was an inline line on the Meetings page, and the editor passed it to that page through router state. Spec 0004 now asks for a toast that closes after 8 seconds, stays open across pages, and turns into an error when a restore fails. Focus no longer goes to Undo after an archive; it goes to a neighboring row. The executable specs `archive.spec.tsx` and `archive.browser.spec.tsx` describe the new behavior and pass only after Task 5.

### Review Focus for Tasks 4 and 5

1. **Undo is clicked twice quickly.** Only one `unarchive_meeting` call is made. (Task 4, `archive-provider.test.tsx`)
2. **A restore finishes after another meeting was archived.** The newer toast stays open, shows no error, and focus does not jump to the restored meeting, but the list still reloads so the restored meeting appears. (Task 4, `archive-provider.test.tsx`)
3. **Undo is clicked on another page.** The Meetings page is not mounted. The restore still happens, React logs no warnings, and the Meetings page shows the meeting when it opens. (Task 5, covered by the executable spec "stays open on another page, where Undo still restores the meeting")
4. **The generated shadcn file.** It must pass lint and typecheck without turning off rules, and its imports must point at this project's paths. (Task 4)
5. **A list response that was in flight when a meeting was archived.** It must not bring the archived meeting back into the list. (Task 5, `meetings-page.test.tsx`)

### Task 4: Add the toast component and the archive provider

**Files:**
- Create: `src/components/ui/toast.tsx` (generated), `src/components/toaster.tsx`
- Create: `src/features/meetings/archive-provider.tsx`, `src/features/meetings/archive-provider.test.tsx`

**Interfaces:**
- Consumes: `archiveMeeting`, `unarchiveMeeting`, `displayName` from `src/lib/meetings.ts`.
- Produces: `Toaster` in `src/components/toaster.tsx`: renders the toast portal and a viewport with `aria-label="Notifications"`, and one toast for each entry of Base UI's `useToastManager().toasts`, with its title, its action button, and a close button.
- Produces: in `archive-provider.tsx`:
  - `ArchiveProvider({ children }: { children: ReactNode })`. It must be inside the toast provider.
  - `useArchive(): ArchiveApi`, where `type ArchiveApi = { archive: (meeting: { id: number; name: string }) => Promise<void>; version: number; restored: { id: number } | null }`.
  - `archive` calls `archiveMeeting(id)`. If that fails, `archive` rejects, and the page shows its inline error. If it succeeds, `archive` closes the toast of the earlier archive, if one is open, adds a toast with the title `Archived "<displayName(name)>".`, the action `Undo`, and a timeout of 8000 milliseconds, and increments `version`.
  - Undo calls `unarchiveMeeting(id)`, and ignores further clicks on the same toast while the call runs. On success, it closes the toast and increments `version`. If no newer archive happened since, it also sets `restored` to a new `{ id }` object. On failure, it updates the same toast: the title becomes `Couldn't restore the meeting. Try again.`, the action stays `Undo`, and the timeout is 8000 milliseconds again.
  - `version` tells pages that the set of archived meetings changed. `restored` tells the Meetings page which link to focus.

- [ ] **Step 1: Add the toast component**

Run `bunx --bun shadcn@latest add toast`, then `bun run fmt`. In the generated `src/components/ui/toast.tsx`:
- Import `cn` from `@/lib/utils` and `Button` from `@/components/ui/button`.
- Replace each `IconPlaceholder` with the `lucide-react` icon it names, such as `XIcon`.
- Give `ToastClose` the default `aria-label="Close"`.

Then fix any lint or type errors in the file itself, without turning off rules.

- [ ] **Step 2: Write the failing tests for the provider**

In `archive-provider.test.tsx`, mock `@tauri-apps/api/core` as the other tests do. Render a small test component that calls `useArchive()` and shows `version` and `restored`, inside the toast provider, `ArchiveProvider`, and `Toaster`. Add these tests:
- `it("shows a toast with the name and Undo after an archive")`
- `it("rejects and shows no toast when archiving fails")`
- `it("closes the earlier toast when another meeting is archived")`
- `it("restores once when Undo is clicked twice quickly")`: hold the `unarchive_meeting` promise, click Undo twice, and expect one call.
- `it("changes the toast to an error and keeps Undo when restoring fails")`
- `it("increments version after an archive and after a restore")`
- `it("does not set restored or touch the newer toast when an older restore finishes late")`

- [ ] **Step 3: Run them to see them fail**

Run: `bunx vitest run src/features/meetings/archive-provider.test.tsx`
Expected: FAIL, because `archive-provider.tsx` does not exist.

- [ ] **Step 4: Implement `Toaster` and `ArchiveProvider`**

Use one toast manager from `Toast.createToastManager()`, which the generated file exports as `toast`, and pass it to the provider in tests and in Task 5. Keep the identifier of the open archive toast and a counter of archives in refs. The counter replaces `noticeGeneration` and decides whether a restore is stale.

- [ ] **Step 5: Run the tests and the task check, then commit**

Run: `bunx vitest run src/features/meetings/archive-provider.test.tsx`
Expected: PASS.

Run the task check. Expected: every command succeeds. `archive.spec.tsx` and `archive.browser.spec.tsx` are still excluded.

```bash
git add src/components/ui/toast.tsx src/components/toaster.tsx src/features/meetings/archive-provider.tsx src/features/meetings/archive-provider.test.tsx package.json bun.lock
git commit -m "Add a toast component and an archive provider"
git push
```

### Task 5: Show the archive toast from the Meetings page and the editor

**Files:**
- Modify: `src/App.tsx`, `src/App.test.tsx` (only if it needs the new providers)
- Modify: `src/features/meetings/meetings-page.tsx`, `src/features/meetings/meetings-page.test.tsx`
- Modify: `src/features/meetings/meeting-editor.tsx`, `src/features/meetings/meeting-editor-page.test.tsx`
- Test: `archive.spec.tsx`, `archive.browser.spec.tsx` (already written, do not change)

**Interfaces:**
- Consumes: `Toaster`, the toast manager, `ArchiveProvider`, and `useArchive` from Task 4.
- Removes: `ArchivedMeeting` and `MeetingsPageState` from `meetings-page.tsx`, the inline notice and its Undo button, the restore error, `noticeGeneration`, `archivedMeetingRef`, and the list filter. The editor no longer passes router state.

- [ ] **Step 1: Update the unit tests**

In `meetings-page.test.tsx`, render the page inside the toast provider, `ArchiveProvider`, and `Toaster`. Delete the tests of the inline notice, whose behavior now lives in the provider and its tests. These are the tests about the location state notice, Undo, the restore error, focus on Undo, and stale restores. Keep the tests of the list, creation, and the archive error. Add:
- `it("moves focus to the archive button of the next meeting after an archive")`, and the same for the last meeting and for an empty list, with the focus targets that the spec gives.
- `it("moves focus to the restored meeting's link after Undo")`
- `it("ignores a list response that was in flight when a meeting was archived")`: hold the first `list_meetings` promise, then archive a meeting. Release the promise with the archived meeting still in it, and expect the meeting to stay out of the list.

In `meeting-editor-page.test.tsx`, replace the test "gives the Meetings page the name that the user typed" with one that expects a toast with `Archived "Retro".`, and render with the providers. Remove the `location-state` element if nothing uses it any more.

- [ ] **Step 2: Run the tests and the executable specs to see them fail**

Run: `bunx vitest run src/features/meetings/meetings-page.test.tsx src/features/meetings/meeting-editor-page.test.tsx src/features/meetings/archive.spec.tsx`
Expected: FAIL in the new tests and in the spec cases about the toast and focus.

- [ ] **Step 3: Wire the providers and the pages**

- `App.tsx`: wrap the router in the toast provider (with the shared manager) and `ArchiveProvider`, and render `<Toaster />` once, outside the routes.
- `meetings-page.tsx`:
  - The list effect depends on `[attempt, version]`, so a restore or an archive from any page reloads the list. The effect's existing `current` flag discards a response that an archive made stale.
  - The row button calls `archive(meeting)`. On success, it removes the row and moves focus to the archive button at the same index, or at the index before, or to "New note" if the list is now empty. On failure, it shows the inline archive error. A successful archive clears that error.
  - When `restored` changes and the loaded list contains that meeting, focus its link.
- `meeting-editor.tsx`: call `archive({ id: meeting.id, name: draft.name })`, then `navigate("/meetings")` without state. Keep the disabled state and the inline error.

- [ ] **Step 4: Run the full check**

Run: `bun run check`
Expected: every command succeeds, including `archive.spec.tsx` and `archive.browser.spec.tsx`. Run `bunx vitest run` two more times and expect no failures.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/features/meetings
git commit -m "Show the archive notice as a toast"
git push
```

After Task 5, check by hand with `bun run tauri dev`:
- The toast's 8 seconds stop while the pointer is over it, and they start again after a failed restore.
- F6 moves focus to the toast.

