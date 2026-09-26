# Managing Initiatives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user record the company initiatives that they have a role in, on an Initiatives page and an editor page for each initiative, archive them like meetings, and assign each meeting to an initiative from the meeting details sidebar.

**Architecture:** The Rust backend gets an `initiatives` table, a column `meetings.initiative_id`, an `initiatives.rs` module with all SQL for initiatives, and seven commands (ADR 0013). Before the initiative pages are built, the parts of the meeting pages that do not depend on meetings move out of `src/features/meetings/` and get neutral names: the Markdown editor, autosave, the save status, the details sidebar, the archive provider, and the list of items with its "Archive" buttons and focus handling (ADR 0014). The meeting pages keep their behavior, which their existing specs prove. The initiative pages in `src/features/initiatives/` are then built from these shared parts. Last, the meeting editor gets a select box that assigns the meeting to an initiative.

**Tech Stack:** Rust with `rusqlite` and `rusqlite_migration`; React 19 with TypeScript; React Router; Tailwind CSS v4; shadcn components on Base UI; TipTap; Vitest with React Testing Library in jsdom, and Vitest browser mode in WebKit.

**Spec:** `docs/specs/0006-managing-initiatives.md`, with `docs/adrs/0013-store-initiatives-and-link-meetings-to-them.md` and `docs/adrs/0014-share-editor-and-list-building-blocks.md`. The executable specs are `src/features/initiatives/initiatives.spec.tsx`, `src/features/initiatives/initiatives.browser.spec.tsx`, and `src/features/meetings/meeting-initiative.spec.tsx`. Do not change these three files to make them pass. If one seems wrong, stop and ask a human.

## Global Constraints

- Exact copy for initiatives: sidebar link and page title "Initiatives"; button "New initiative"; "No initiatives yet"; "Loading…"; "Couldn't load initiatives" with a "Retry" button; default and placeholder name "Untitled initiative"; field "Initiative name"; editor "Description"; landmark "Initiative details"; row label "Role"; select "RACI role"; role labels "Responsible", "Accountable", "Consulted", "Informed"; "This initiative doesn't exist." with the link "Back to Initiatives"; "Couldn't load this initiative" with a "Retry" button; row button `Archive "<name>"`; sidebar button "Archive"; toast `Archived "<name>".`.
- Exact copy of failure toasts: "Couldn't create the initiative. Try again."; "Couldn't archive the initiative. Try again."; "Couldn't assign the initiative. Try again.". The text of the archive toast after a failed restore: "Couldn't restore the initiative. Try again.".
- Exact copy on the meeting page: row label "Initiative"; select "Meeting initiative"; an archived initiative's choice is `<name> (archived)`.
- Stored role values are lowercase: `responsible`, `accountable`, `consulted`, `informed`, or `NULL`. In the frontend, the empty choice of a select has the value `""`, which means `null`.
- A name that is empty or has only spaces is shown as "Untitled initiative", as `displayName` does for meetings.
- Initiatives are listed newest first: `created_at DESC, id DESC`.
- The choices of "Meeting initiative": the empty choice; then the initiatives that are not archived, in the order of `list_initiatives`; then the archived initiatives sorted by their shown name with `localeCompare(other, undefined, { sensitivity: "base" })`.
- The initiative's name, description, and role are saved together with `useAutosave` (500 milliseconds). The assignment of a meeting is saved at once with `set_meeting_initiative` and never through `update_meeting`.
- The meeting pages must keep their behavior. The existing specs `src/features/meetings/*.spec.tsx`, `src/features/tasks/*.spec.tsx`, and `src/components/*.spec.tsx` may change only in their fake backends, which must answer the new commands.
- Run `bun run fmt` after editing TypeScript and `bun run fmt:rust` after editing Rust. At the end of every task, `bun run check` must pass, except for the tests of the three new executable spec files that the task does not yet cover. Do not reference ADR or plan sections in code comments. Public items get docstrings in ASD-STE100 style (short sentences, simple words), like the existing ones.

## Review Focus

These cases are not tested by the feature specs, but a user is likely to meet them. Each line has a test in the task that owns the code.

1. The user changes "Meeting initiative" twice quickly, and the first save fails after the second one succeeded. The select must keep the second choice, and it must not go back to the older saved value. (Task 6)
2. The user archives a meeting, opens the Initiatives page, and clicks "Undo" in the toast. The Initiatives page must not move focus, and it must not treat the meeting's identifier as an initiative's identifier. The same applies the other way around. (Task 3)
3. An initiative's name has only spaces. The list, the breadcrumb, the archive button, the archive toast, and the meeting's select must all show "Untitled initiative". (Task 1 for the helper, Task 4 for the page)
4. The user upgrades from a database that already has meetings and tasks. After migration 4, every meeting and task is still there, and every meeting has no initiative. (Task 1)
5. The backend gets a role with capital letters, such as `Responsible`, or an unknown role. It must refuse it with a clear message and keep the initiative unchanged. (Task 1)

---

## File Structure

| File                                                                 | Responsibility                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/db.rs` (modify)                                       | Migration 4 and a test that upgrades from migration 3.                                                  |
| `src-tauri/src/initiatives.rs` (create)                              | `Initiative`, `InitiativeSummary`, `Error`, and all SQL for initiatives, with tests.                    |
| `src-tauri/src/meetings.rs` (modify)                                 | `Meeting.initiative_id`, `set_initiative`, and a new error for an initiative that does not exist.       |
| `src-tauri/src/lib.rs` (modify)                                      | Seven thin commands.                                                                                    |
| `docs/data-model.md` (modify)                                        | ERD and column descriptions for `initiatives` and `meetings.initiative_id`.                             |
| `src/lib/initiatives.ts` (create), `initiatives.test.ts`             | Types, role labels, name helper, the choices of the meeting's select, and the only `invoke` calls.      |
| `src/lib/meetings.ts` (modify), `meetings.test.ts`                   | `Meeting.initiativeId` and `setMeetingInitiative`.                                                      |
| `src/components/markdown-editor/` (moved from `features/meetings`)   | `MarkdownEditor`, its link popover, and its link shortcut.                                              |
| `src/hooks/use-autosave.ts` (moved)                                  | Unchanged autosave hook.                                                                                |
| `src/components/save-status.tsx` (moved)                            | Unchanged save status.                                                                                  |
| `src/components/details-sidebar.tsx` (moved and renamed)             | `DetailsSidebar` with a landmark name and optional lists.                                               |
| `src/components/archive-provider.tsx`, `use-archive.ts` (moved)      | Archive toast and Undo for meetings and initiatives.                                                    |
| `src/components/archivable-list.tsx` (create)                        | A loaded list of links with "Archive" buttons and the focus handling after archive and restore.         |
| `src/components/ui/native-select.tsx` (create)                       | shadcn native select, added with the shadcn command.                                                    |
| `src/features/initiatives/initiatives-page.tsx`                      | The Initiatives page.                                                                                   |
| `src/features/initiatives/initiative-editor-page.tsx`                | Loads one initiative by the route's identifier.                                                         |
| `src/features/initiatives/initiative-editor.tsx`                     | Name, description, and the sidebar with the role and "Archive".                                         |
| `src/features/meetings/meeting-initiative-select.tsx` (create)       | The "Initiative" row of the meeting details sidebar.                                                    |
| `src/components/app-sidebar.tsx`, `src/App.tsx` (modify)             | The Initiatives section and its routes.                                                                 |

---

### Task 1: Store initiatives and assignments, and expose the commands

This is a backend slice with its frontend data module. After it, the application has the table, the column, and the commands, and nothing in the user interface changes.

**Files:**
- Modify: `src-tauri/src/db.rs`, `src-tauri/src/meetings.rs`, `src-tauri/src/lib.rs`, `docs/data-model.md`, `src/lib/meetings.ts`, `src/lib/meetings.test.ts`
- Create: `src-tauri/src/initiatives.rs`, `src/lib/initiatives.ts`, `src/lib/initiatives.test.ts`

**Interfaces:**
- Produces (Rust, `initiatives.rs`):
  - `pub const DEFAULT_NAME: &str = "Untitled initiative";`
  - `pub const RACI_ROLES: [&str; 4] = ["responsible", "accountable", "consulted", "informed"];`
  - `pub struct Initiative { id: i64, name: String, description: String, raci_role: Option<String>, created_at: String, updated_at: String, archived_at: Option<String> }` and `pub struct InitiativeSummary { id, name, raci_role, updated_at, archived_at }`, both `Serialize` with `rename_all = "camelCase"`.
  - `pub enum Error { NotFound(i64), InvalidRole(String), Database(rusqlite::Error) }`. Messages: `initiative {id} not found`; `invalid RACI role "{role}": use responsible, accountable, consulted, or informed`; `database error: {error}`.
  - `list(&Connection, include_archived: bool) -> Result<Vec<InitiativeSummary>, Error>`, `create(&Connection) -> Result<Initiative, Error>`, `get(&Connection, id: i64) -> Result<Option<Initiative>, Error>`, `update(&Connection, id: i64, name: &str, description: &str, raci_role: Option<&str>) -> Result<Initiative, Error>`, `archive(&Connection, id: i64) -> Result<(), Error>`, `unarchive(&Connection, id: i64) -> Result<(), Error>`.
- Produces (Rust, `meetings.rs`): `Meeting.initiative_id: Option<i64>`; `Error::InitiativeNotFound(i64)` with the message `initiative {id} not found`; `set_initiative(&Connection, id: i64, initiative_id: Option<i64>) -> Result<Meeting, Error>`.
- Produces (commands in `lib.rs`): `list_initiatives(include_archived: bool)`, `create_initiative()`, `get_initiative(id: i64)`, `update_initiative(id: i64, name: &str, description: &str, raci_role: Option<String>)`, `archive_initiative(id: i64)`, `unarchive_initiative(id: i64)`, `set_meeting_initiative(id: i64, initiative_id: Option<i64>)`. Each has the `#[expect(clippy::needless_pass_by_value, ...)]` attribute and calls `Database::run`.
- Produces (TypeScript, `src/lib/initiatives.ts`):
  - `type RaciRole = "responsible" | "accountable" | "consulted" | "informed"`
  - `type Initiative = { id: number; name: string; description: string; raciRole: RaciRole | null; createdAt: string; updatedAt: string; archivedAt: string | null }`
  - `type InitiativeSummary = Pick<Initiative, "id" | "name" | "raciRole" | "updatedAt" | "archivedAt">`
  - `type InitiativeChanges = Pick<Initiative, "name" | "description" | "raciRole">`
  - `const DEFAULT_INITIATIVE_NAME = "Untitled initiative"`
  - `const RACI_ROLES: { value: RaciRole; label: string }[]`, in the order Responsible, Accountable, Consulted, Informed
  - `raciRoleLabel(role: RaciRole): string`
  - `initiativeDisplayName(name: string): string`
  - `type InitiativeChoice = { id: number; label: string }` and `initiativeChoices(initiatives: InitiativeSummary[]): InitiativeChoice[]`, which returns the choices of the meeting's select without the empty choice
  - `listInitiatives(options: { includeArchived: boolean }): Promise<InitiativeSummary[]>`, `createInitiative(): Promise<Initiative>`, `getInitiative(id: number): Promise<Initiative | null>`, `updateInitiative(id: number, changes: InitiativeChanges): Promise<Initiative>`, `archiveInitiative(id: number): Promise<void>`, `unarchiveInitiative(id: number): Promise<void>`
- Produces (TypeScript, `src/lib/meetings.ts`): `Meeting.initiativeId: number | null`; `setMeetingInitiative(id: number, initiativeId: number | null): Promise<Meeting>`.

- [ ] **Step 1: Write the failing Rust tests**

In `initiatives.rs` `mod tests`, against `db::open_in_memory()`:
- `create_gives_the_default_name_an_empty_description_and_no_role`
- `list_leaves_out_archived_initiatives_unless_asked`: archive one of two initiatives. `list(false)` returns one. `list(true)` returns both, and the archived one has `archived_at` set.
- `list_puts_the_newest_first`: three initiatives are created in a row. The order is the reverse of creation, and `id DESC` breaks ties of `created_at`.
- `update_replaces_the_fields_and_changes_updated_at`
- `update_accepts_no_role`
- `update_refuses_an_unknown_role_and_keeps_the_initiative` (Review Focus 5): both `"Responsible"` and `"owner"` give `Error::InvalidRole`, and `get` returns the initiative unchanged.
- `the_database_refuses_an_unknown_role`: a direct `INSERT` with `raci_role = 'owner'` fails, which proves the `CHECK` constraint.
- `archive_keeps_the_first_time_and_does_not_change_updated_at`; `unarchive_brings_it_back_into_the_list`
- `archiving_an_initiative_keeps_the_assignments_of_its_meetings`
- `operations_on_a_missing_initiative_return_not_found`, for `update`, `archive`, and `unarchive`

In `meetings.rs` `mod tests`:
- `a_new_meeting_has_no_initiative`
- `set_initiative_assigns_and_removes_the_initiative_and_changes_updated_at`
- `set_initiative_refuses_an_initiative_that_does_not_exist`: returns `Error::InitiativeNotFound`.
- `set_initiative_on_a_missing_meeting_returns_not_found`
- `update_does_not_change_the_initiative`

In `db.rs` `mod tests`:
- `migration_4_keeps_meetings_and_tasks_and_assigns_no_initiative` (Review Focus 4): apply `MIGRATIONS[..3]`, insert a meeting and a task with SQL, run `migrate`, then check that `meetings::get` returns the meeting with `initiative_id == None` and that `tasks::list_for_meeting` returns the task.

- [ ] **Step 2: Run the Rust tests to verify that they fail**

Run: `bun run test:rust`
Expected: compile errors for the missing module, functions, and field.

- [ ] **Step 3: Implement the migration, the modules, and the commands**

Append migration 4 to `MIGRATIONS`:

```sql
CREATE TABLE initiatives (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    raci_role   TEXT CHECK (raci_role IN ('responsible', 'accountable', 'consulted', 'informed')),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    archived_at TEXT
);
ALTER TABLE meetings ADD COLUMN initiative_id INTEGER REFERENCES initiatives(id);
CREATE INDEX meetings_initiative_id ON meetings(initiative_id);
```

- `initiatives.rs` follows `meetings.rs`, uses `crate::meetings::NOW`, and checks `raci_role` against `RACI_ROLES` before it writes.
- `meetings::set_initiative` checks that the initiative exists, in the same way that `tasks::create` checks the meeting, so that the error names the initiative.
- `update` does not touch `initiative_id`. Add `initiative_id` to every `SELECT` that builds a `Meeting`.
- Register the seven commands in `generate_handler!`.

- [ ] **Step 4: Run the Rust checks**

Run: `bun run test:rust && bun run lint:rust && bun run fmt:rust:check`
Expected: all pass.

- [ ] **Step 5: Write the failing TypeScript tests**

In `src/lib/initiatives.test.ts`, mocking `@tauri-apps/api/core` as `src/lib/meetings.test.ts` does:
- Each command function calls `invoke` with the exact command name and arguments. `createInitiative()` calls `invoke("create_initiative", {})`, because the executable spec checks for the empty object. `listInitiatives({ includeArchived: true })` calls `invoke("list_initiatives", { includeArchived: true })`.
- `initiativeDisplayName("   ")` returns `"Untitled initiative"` (Review Focus 3).
- `raciRoleLabel("consulted")` returns `"Consulted"`, and `RACI_ROLES.map((r) => r.label)` equals `["Responsible", "Accountable", "Consulted", "Informed"]`.
- `initiativeChoices`: given, in list order, `Launch` (active), `zeta pilot` (archived), `""` (active), `Alpha program` (archived), and `Beta rollout` (archived), it returns the labels `["Launch", "Untitled initiative", "Alpha program (archived)", "Beta rollout (archived)", "zeta pilot (archived)"]` with their identifiers.

In `src/lib/meetings.test.ts`: `setMeetingInitiative(3, null)` calls `invoke("set_meeting_initiative", { id: 3, initiativeId: null })`.

- [ ] **Step 6: Run the tests to verify that they fail, then implement `src/lib/initiatives.ts` and the changes to `src/lib/meetings.ts`**

Run: `bun run test src/lib`
Expected: FAIL before the implementation, and PASS after it.

- [ ] **Step 7: Update the ERD**

In `docs/data-model.md`, add the `initiatives` entity with column descriptions in the style of the existing ones, add `initiative_id` to `meetings`, add the relationship `initiatives |o--o{ meetings : "has meetings"`, and add a "### `initiatives`" section. The section says that `raci_role` accepts only the four lowercase values, and that archiving keeps the assignments of meetings. Also describe `initiative_id` in the `meetings` section.

- [ ] **Step 8: Run `bun run check` and commit**

Expected: everything passes except the three new executable spec files.

```bash
git add src-tauri docs/data-model.md src/lib
git commit -m "Store initiatives and meeting assignments, and add the initiative commands"
```

---

### Task 2: Share the Markdown editor, autosave, save status, and details sidebar

A move with no change in behavior. The meeting pages use the shared parts afterward.

**Files:**
- Move: `src/features/meetings/notes-editor.tsx` → `src/components/markdown-editor/markdown-editor.tsx`; `link-popover.tsx` and `link-shortcut.ts` → `src/components/markdown-editor/`; `notes-editor.test.tsx` → `src/components/markdown-editor/markdown-editor.test.tsx`
- Move: `src/features/meetings/use-autosave.ts` and its test → `src/hooks/`; `save-status.tsx` → `src/components/save-status.tsx`
- Move and rename: `src/features/meetings/meeting-details-sidebar.tsx` → `src/components/details-sidebar.tsx`
- Modify: `src/features/meetings/meeting-editor.tsx`, `src/features/meetings/meeting-editor.browser.test.tsx`, `src/features/tasks/action-item-row.tsx`, and every other file that imports the moved modules. Find them with `grep -rn "notes-editor\|use-autosave\|save-status\|meeting-details-sidebar" src`.

**Interfaces:**
- Produces: `MarkdownEditor({ initialMarkdown, onChange, label }: { initialMarkdown: string; onChange: (markdown: string) => void; label: string })`. `label` is the `aria-label` of the text area. Rename the CSS class `notes-editor` to `markdown-editor` in the component and in `src/index.css`.
- Produces: `useAutosave` from `@/hooks/use-autosave`, and `SaveStatus` from `@/components/save-status`, both unchanged.
- Produces: `DetailsSidebar({ label, properties, actions, lists }: { label: string; properties: ReactNode; actions: ReactNode; lists?: ReactNode })`. Without `lists`, it renders neither the separator nor the list area.

- [ ] **Step 1: Confirm the baseline**

Run: `bun run check`
Expected: everything passes except the three new executable spec files.

- [ ] **Step 2: Move the files with `git mv`, rename the components and the props, and update the imports**

The meeting editor passes `label="Notes"` and `label="Meeting details"`.

- [ ] **Step 3: Add a unit test for the optional lists**

In a new file `src/components/details-sidebar.test.tsx`, add the test `leaves out the separator and the lists when there are none`. Render it with `label="Initiative details"` and no `lists`. Check that the landmark has the name "Initiative details" and that there is no `separator` role in it.

- [ ] **Step 4: Run `bun run check`**

Expected: everything passes except the three new executable spec files. The existing specs of the meeting pages pass without any change.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Share the Markdown editor, autosave, save status, and details sidebar"
```

---

### Task 3: Share the archive provider and the archivable list

After this task, `ArchiveProvider` knows two kinds of items, and the Meetings page renders its list with the shared `ArchivableList`. The behavior of the Meetings page does not change.

**Files:**
- Move: `src/features/meetings/archive-provider.tsx`, `use-archive.ts`, and `archive-provider.test.tsx` → `src/components/`
- Create: `src/components/archivable-list.tsx`, `src/components/archivable-list.test.tsx`
- Modify: `src/features/meetings/meetings-page.tsx`, `src/features/meetings/meeting-editor.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `archiveInitiative`, `unarchiveInitiative`, and `initiativeDisplayName` (Task 1).
- Produces (`use-archive.ts`):
  - `type ArchiveKind = "meeting" | "initiative"`
  - `type ItemToArchive = { kind: ArchiveKind; id: number; name: string }`, where `name` is the raw stored name
  - `type RestoredItem = { kind: ArchiveKind; id: number }`
  - `type ArchiveApi = { archive: (item: ItemToArchive) => Promise<void>; version: number; restored: RestoredItem | null }`
  - `useArchive()`
- Produces (`archivable-list.tsx`):

```ts
export function ArchivableList<T extends { id: number; name: string }>(props: {
    /** The kind of the items, which selects the archive commands. */
    kind: ArchiveKind;
    /** Loads the items that are not archived. Called again after each archive or restore. */
    load: () => Promise<T[]>;
    /** The route that opens the item. */
    itemPath: (item: T) => string;
    /** The name to show for a stored name. */
    displayName: (name: string) => string;
    /** Content at the right side of the row, in muted text, such as the date or the role. */
    detail: (item: T) => ReactNode;
    emptyText: string; // "No meetings yet"
    loadErrorText: string; // "Couldn't load meetings"
    archiveFailureMessage: string; // "Couldn't archive the meeting. Try again."
    /** The button that gets focus when the list becomes empty after an archive. */
    fallbackFocusRef: RefObject<HTMLButtonElement | null>;
}): JSX.Element;
```

  `ArchivableList` owns what `MeetingsPage` does today below its title: the load state, the Retry button, the rows, the handling of a second click while an archive is in progress, the removal of the row after an archive, the focus after an archive, and the focus on the link of a restored item. It renders the scrolling grid cell (`overflow-y-auto px-6 pt-2 pb-4`) itself. It reacts only to a `restored` item whose `kind` equals its own `kind`.
- The page keeps the header, the title, the create button, and the focus on the create button when it opens after an archive from the editor page.

- [ ] **Step 1: Write the failing unit tests**

In `archive-provider.test.tsx`, change the harness to pass `{ kind: "meeting", id, name }`. The API changed on purpose, so say so in the commit message. Add:
- `archives and restores an initiative with the initiative commands`: `archive_initiative` and `unarchive_initiative` are called, the toast says `Archived "Launch".`, and `restored` is `{ kind: "initiative", id: 1 }`.
- `names an initiative with an empty name Untitled initiative in the toast`
- `says that the initiative could not be restored`: the toast text becomes "Couldn't restore the initiative. Try again.".
- `closes a meeting's toast when an initiative is archived`

In `archivable-list.test.tsx`, add `ignores a restore of the other kind` (Review Focus 2). Render `ArchivableList` with `kind="initiative"` inside the providers, and use a probe component to archive and then restore a meeting whose `id` equals an initiative's `id`. Focus must stay where it was, and it must not move to the initiative's link.

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `bun run test src/components`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Give `ArchiveProvider` a table keyed by `ArchiveKind`, with the archive function, the unarchive function, the display name function, and the text for a failed restore of each kind.
- Move the list code of `MeetingsPage` into `ArchivableList` without changing its logic or its comments, apart from names.
- `MeetingsPage` passes `kind="meeting"`, `load={listMeetings}`, `detail={(m) => formatMeetingDate(m.date)}`, and its existing copy.
- The meeting editor calls `archive({ kind: "meeting", id, name })`.

- [ ] **Step 4: Run `bun run check`**

Expected: everything passes except the three new executable spec files. `src/features/meetings/archive.spec.tsx`, `archive.browser.spec.tsx`, `meetings-page.test.tsx`, and `meetings-page.browser.test.tsx` pass without changes to their assertions.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Share the archive provider and the archivable list between kinds of items"
```

---

### Task 4: The Initiatives section, the list, creation, and the editor page

After this task, the user can open Initiatives, create an initiative, and edit its name, description, and role. Archiving comes in Task 5.

**Files:**
- Create: `src/components/ui/native-select.tsx` (run `bunx --bun shadcn@latest add native-select`, then `bun run fmt`, and fix lint errors in the generated file if there are any)
- Create: `src/features/initiatives/initiatives-page.tsx`, `initiative-editor-page.tsx`, `initiative-editor.tsx`, and `initiatives-page.test.tsx`
- Modify: `src/components/app-sidebar.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `ArchivableList` (Task 3), `MarkdownEditor`, `DetailsSidebar`, `useAutosave`, and `SaveStatus` (Task 2), and `src/lib/initiatives.ts` (Task 1).
- Produces: `SECTIONS` gets `{ title: "Initiatives", path: "/initiatives", icon: TargetIcon }` after Meetings. The routes are `/initiatives` → `InitiativesPage` and `/initiatives/:id` → `InitiativeEditorPage`.
- Produces: `type NewInitiativeState = { isNew: true }` and `type InitiativesPageState = { focusNewInitiative: true }`, exported from `initiatives-page.tsx`.
- Produces: `InitiativeEditor({ initiative, isNew }: { initiative: Initiative; isNew: boolean })`.

- [ ] **Step 1: Run the executable spec to see which tests fail**

Run: `bunx vitest run --project unit src/features/initiatives/initiatives.spec.tsx`
Expected: all tests fail on the missing "Initiatives" link.

- [ ] **Step 2: Write a failing unit test for Review Focus 3**

In `initiatives-page.test.tsx`, add `shows an initiative whose name has only spaces as Untitled initiative`. Use a fake backend with one initiative named `"   "`. Check that the link and the `Archive "Untitled initiative"` button are shown, that the breadcrumb of its editor page says "Untitled initiative", and that the `Initiative name` field keeps the value `"   "`.

- [ ] **Step 3: Implement**

- `InitiativesPage` copies the structure of `MeetingsPage`: the header with "New initiative", the title, and an `ArchivableList` with `kind="initiative"`, `load={() => listInitiatives({ includeArchived: false })}`, and a `detail` that shows `raciRoleLabel(role)` when there is a role.
- Creating an initiative uses `useFailureToast`: `show("Couldn't create the initiative. Try again.")` on failure and `clear()` on success. The inline alert of `MeetingsPage` is not copied.
- `InitiativeEditorPage` copies `MeetingEditorPage`, with the copy for initiatives from the Global Constraints.
- `InitiativeEditor` copies the layout of `MeetingEditor`. Its draft is `InitiativeChanges`, saved with `updateInitiative`. The sidebar is `DetailsSidebar label="Initiative details"`. Its properties are the "Role" label and a `NativeSelect` with `aria-label="RACI role"`: an option with `value=""` and empty text, then `RACI_ROLES`. `""` becomes `null` in the draft. In this task, `actions` is empty.
- The `MarkdownEditor` has `label="Description"`.

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run --project unit src/features/initiatives && bunx vitest run --project browser src/features/initiatives`
Expected: the tests of the sections "section", "Initiatives page", "creating an initiative", and "initiative editor page" in `initiatives.spec.tsx` pass, and so does the new unit test. The tests of "archiving an initiative" still fail, except the tests of the list page, which may pass already. In `initiatives.browser.spec.tsx`, "scrolls the description…" fails on the missing "Archive" button until Task 5, and the other two tests pass.

- [ ] **Step 5: Run `bun run check` and commit**

```bash
git add -A src components.json package.json bun.lock
git commit -m "Add the Initiatives section with a list, creation, and an editor page"
```

---

### Task 5: Archive initiatives

**Files:**
- Modify: `src/features/initiatives/initiative-editor.tsx`, and `initiatives-page.tsx` if it is needed for the focus after an archive from the editor

**Interfaces:**
- Consumes: `useArchive().archive({ kind: "initiative", id, name })` (Task 3) and `InitiativesPageState` (Task 4).

- [ ] **Step 1: Run the archive tests to verify that they fail**

Run: `bunx vitest run --project unit src/features/initiatives/initiatives.spec.tsx -t "archiving an initiative"`
Expected: the tests of the editor page fail on the missing "Archive" button. The tests of the list page pass already through `ArchivableList`. If one of them fails, fix the cause in `ArchivableList` or in the page.

- [ ] **Step 2: Implement**

Add the "Archive" button to the `actions` of the sidebar, as in `MeetingEditor`. On success, `failureToast.clear()`, and `navigate("/initiatives", { state: { focusNewInitiative: true } })`. On failure, `failureToast.show("Couldn't archive the initiative. Try again.")`, and enable the button again.

- [ ] **Step 3: Run the tests**

Run: `bunx vitest run --project unit src/features/initiatives && bunx vitest run --project browser src/features/initiatives`
Expected: all tests of both initiative spec files pass.

- [ ] **Step 4: Run `bun run check` and commit**

```bash
git add src/features/initiatives
git commit -m "Archive initiatives from the list and from the editor page"
```

---

### Task 6: Assign a meeting to an initiative

**Files:**
- Create: `src/features/meetings/meeting-initiative-select.tsx`, `src/features/meetings/meeting-initiative-select.test.tsx`
- Modify: `src/features/meetings/meeting-editor.tsx`
- Modify the fake backends that open the meeting editor page, so that they answer `list_initiatives` with `[]` and give each meeting `initiativeId: null`: `src/App.test.tsx`, `src/components/section-nav.spec.tsx`, `src/features/meetings/archive.spec.tsx`, `meeting-editor-page.test.tsx`, `meeting-editor.browser.test.tsx`, `meetings.spec.tsx`, `scrolling.browser.spec.tsx`, `src/features/tasks/action-items.spec.tsx`, and `action-items.browser.spec.tsx`. Find them with `grep -rln "list_meeting_tasks" src`. Change only the fakes.

**Interfaces:**
- Consumes: `listInitiatives`, `initiativeChoices`, and `setMeetingInitiative` (Task 1), `NativeSelect` (Task 4), and `useFailureToast`.
- Produces: `MeetingInitiativeSelect({ meetingId, initialInitiativeId }: { meetingId: number; initialInitiativeId: number | null })`. It renders the whole row: the label "Initiative" and the select `aria-label="Meeting initiative"`, or "Couldn't load initiatives" with a "Retry" button.

- [ ] **Step 1: Run the executable spec to verify that it fails**

Run: `bunx vitest run --project unit src/features/meetings/meeting-initiative.spec.tsx`
Expected: all tests fail on the missing "Meeting initiative" select.

- [ ] **Step 2: Write the failing unit test for Review Focus 1**

In `meeting-initiative-select.test.tsx`, add `keeps the latest choice when an earlier save fails after it`. Make the first `set_meeting_initiative` call return a promise that the test rejects later, and make the second call resolve at once. Choose "Launch" and then "Pilot". Reject the first call. The select must show "Pilot", and a later reload of the choices must not change it. The failure toast may appear.

- [ ] **Step 3: Implement**

- Load `listInitiatives({ includeArchived: true })` when the component mounts and on Retry. The select is disabled while the choices load.
- Keep the value that was saved last in a ref, and the value that is shown in state.
- On a change, show the new value and send `setMeetingInitiative`. Number each request. When a request succeeds, store its value as the saved value and call `failureToast.clear()`. When the latest request fails, show the saved value again and show "Couldn't assign the initiative. Try again.". When an older request fails, show the toast, but do not change the shown value.
- In `MeetingEditor`, add the row to `properties` below the date row. Pass `meeting.initiativeId` as `initialInitiativeId`.

- [ ] **Step 4: Update the fake backends listed above**

- [ ] **Step 5: Run the tests**

Run: `bun run test && bunx vitest run --project browser`
Expected: all tests pass, including the three new executable spec files.

- [ ] **Step 6: Run `bun run check` and commit**

```bash
git add -A src
git commit -m "Assign a meeting to an initiative from the meeting details sidebar"
```

---

### Task 7: Verify and open the pull request

- [ ] **Step 1: Run the full suite**

Run: `bun run check`
Expected: every check passes.

- [ ] **Step 2: Check by hand what the specs cannot check**

Run `bun run tauri dev`. Check the following:
- The "Archive" button of a row is hidden until the pointer is over the row.
- An initiative, its role, and a meeting's assignment are kept after the application is closed and opened again.
- An existing database opens without problems.

- [ ] **Step 3: Update the pull request description and mark it ready**

The description says what changed, as for pull request #13, and lists the decisions that are not in the spec. Run `gh pr ready 14`.
