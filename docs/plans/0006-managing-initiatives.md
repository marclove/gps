# Managing Initiatives on a Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user record company initiatives with a name, a description, and a RACI role, sequence them on a roadmap with the columns Now, Next, Later, and Done by dragging cards, edit each one in a sheet, delete it with Undo, and assign meetings to initiatives.

**Architecture:** The Rust backend gets an `initiatives` table with a column and an order for each initiative, a partial unique index on the name, and a column `meetings.initiative_id`. All of the SQL for initiatives is in a new module, `initiatives.rs`, which keeps the positions in each column dense. The frontend first moves the editor parts that it shares with meetings out of `src/features/meetings/` (the Markdown editor, autosave, save status, and archive provider). The roadmap in `src/features/initiatives/` is then built in slices: the board, the sheet, delete, and dragging with `@dnd-kit`. The last slice adds the initiative select box to the meeting details sidebar.

**Tech Stack:** Rust with `rusqlite` and `rusqlite_migration`; React 19 with TypeScript; React Router; Tailwind CSS v4; shadcn on Base UI; TipTap; `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities`; Vitest with React Testing Library in jsdom, and Vitest browser mode in WebKit.

**Spec:** `docs/specs/0006-managing-initiatives.md`, argued in these ADRs:
- `docs/adrs/0013-store-initiatives-on-a-roadmap.md`
- `docs/adrs/0014-drag-cards-with-dnd-kit.md`
- `docs/adrs/0015-edit-initiatives-in-a-sheet.md`
- `docs/adrs/0016-share-editor-parts-between-meetings-and-initiatives.md`

The executable specs and their shared fake backend must not change to make them pass:
- `src/features/initiatives/roadmap.spec.tsx`
- `src/features/initiatives/initiative-sheet.spec.tsx`
- `src/features/initiatives/roadmap.browser.spec.tsx`
- `src/features/meetings/meeting-initiative.spec.tsx`
- `src/test/fake-roadmap-backend.ts`

If one of them seems wrong, stop and ask a human.

**Earlier attempt:** the branch `feat/managing-initiatives` (PR #14, closed) has commits that tasks here re-apply. Read them for reference with `git show <commit>`. Never cherry-pick them unreviewed. They were written for a list page and an editor page, and each task says what to keep and what to drop.

## Global Constraints

- **Exact copy, section and roadmap:**
  - sidebar link "Initiatives" with `TargetIcon`, below "Meetings"
  - breadcrumb "Initiatives", button "New initiative"
  - column regions "Now", "Next", "Later", "Done", whose heading is the name and the count
  - "No initiatives"
  - "Untitled initiative"
  - "Couldn't load initiatives" with "Retry"
- **Exact copy, sheet:**
  - field "Initiative name", with placeholder "Untitled initiative"
  - button "Close", which is the built-in close button of `SheetContent`, last in the focus order
  - select "RACI role" with the visible label "Role"; choices "", "Responsible", "Accountable", "Consulted", "Informed"
  - `Completed on <Month D, YYYY>`, from `toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })`
  - editor "Description"
  - button "Delete"
  - "Couldn't load the initiative" with "Retry"
  - `Another initiative is named "<trimmed name>".`
- **Exact copy, toasts:**
  - `Deleted "<name>".`
  - "Couldn't create the initiative. Try again."
  - "Couldn't delete the initiative. Try again."
  - "Couldn't restore the initiative. Try again."
  - `Couldn't restore "<name>" because another initiative has that name.`
  - "Couldn't move the initiative. Try again."
  - "Couldn't assign the initiative. Try again."
- **Exact copy, screen reader messages:**
  - `Picked up <name>.`
  - `<name> is in <Column>, position <n> of <count>.`
  - `<name> was moved to <Column>, position <n> of <count>.`
  - `<name> was completed.`
  - `<name> was put back.`

  Positions count from 1, and `<name>` is the shown name.
- **Exact copy, meeting sidebar:** row label "Initiative"; select "Meeting initiative"; option groups "Now", "Next", "Later", "Completed", and "Deleted", with empty groups left out.
- **Stored values:**
  - `raci_role` is `responsible`, `accountable`, `consulted`, `informed`, or `NULL`.
  - `horizon` is `now`, `next`, or `later`.
  - `move_initiative` takes `destination` `now`, `next`, `later`, or `done`.
  - In selects, the empty choice has the value `""`, which means `null`.
- **Index for moves:** the `index` that `move_initiative` gets is the position that the card has in the destination column after the move, counted in that column without the card. The backend clamps it to the range from 0 to the length of the column.
- **Names:** the backend trims names on rename. A name that is empty after trimming is shown as "Untitled initiative". Names are compared case insensitively, without regard to edge spaces. Only initiatives that are not deleted and have a name that is not empty count.
- **Dependencies:** add `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`, and `@dnd-kit/utilities@^3.2.2` with `bun add`. Add no other runtime dependency. Add the shadcn native select with `bunx --bun shadcn@latest add native-select`.
- **Migrations:** migration 4 is appended to `MIGRATIONS` in `src-tauri/src/db.rs`. The ERD in `docs/data-model.md` changes in the same task.
- **Existing specs:** the meeting and task specs, and `src/components/*.spec.tsx`, may change only in their fake backends. A fake must answer `list_initiatives` once the meeting sidebar loads initiatives (Task 9).
- **Code style:**
  - Run `bun run fmt` after editing TypeScript and `bun run fmt:rust` after editing Rust.
  - Public items get docstrings in ASD-STE100 style.
  - Code comments never reference ADR or plan sections.
- **Checks:** at the end of every task, `bun run check` passes, except for the tests in the executable spec files above that the task does not cover yet. Each task lists the spec tests it must turn green.

## Review Focus

1. **A failed move after a later move succeeded.** The user drags card A, then card B, before the first save answers. The first `move_initiative` fails and the second succeeds. The board must end up equal to the backend and must not restore a snapshot that loses B's move. On a failed move, the board shows the toast and loads the list again from the backend. (Task 8)
2. **The position rule over a sequence of changes:**
   - moves down and up in the same column
   - a move with an index larger than the column
   - reopening from Done
   - deleting a completed initiative
   - restoring into a column that became shorter

   After each change, every column on the board has positions exactly 0 to n−1. (Task 1)
3. **Name edge cases:**
   - renaming an initiative to its own name with different case ("launch" to "Launch") is allowed
   - a name of only spaces is stored as empty, and several such names are allowed
   - a deleted initiative whose name is taken cannot be restored, and the database refuses a direct `UPDATE` that clears its `archived_at` (Task 1)
4. **Undo of a meeting archive while the Initiatives page is open.** The roadmap must not move focus or treat the meeting's identifier as an initiative's identifier, and the other way around. (Task 4)
5. **Closing the sheet while a rename is in flight.** When the sheet closes while a rename is still waiting to save, the save runs after the sheet unmounts. If it answers `nameTaken`, nothing may update state that belongs to the closed sheet, and the card keeps its old name. If it succeeds, the card shows the new name. (Task 6)

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/db.rs` (modify) | Migration 4, and a test that upgrades from migration 3. |
| `src-tauri/src/initiatives.rs` (create) | Types, errors, and all SQL for initiatives: order, names, and the results of rename and restore. |
| `src-tauri/src/meetings.rs` (modify) | `Meeting.initiative_id` and `set_initiative`. |
| `src-tauri/src/lib.rs` (modify) | Nine thin commands. |
| `docs/data-model.md` (modify) | ERD and column descriptions. |
| `src/lib/initiatives.ts` (create) | Types, role labels, the shown name, the groups of the meeting select, and the only `invoke` calls. |
| `src/lib/meetings.ts` (modify) | `Meeting.initiativeId` and `setMeetingInitiative`. |
| `src/components/markdown-editor/` (moved) | `MarkdownEditor`, its link popover, and its link shortcut. |
| `src/hooks/use-autosave.ts`, `src/components/save-status.tsx` (moved) | Unchanged. |
| `src/components/archive-provider.tsx`, `use-archive.ts` (moved) | Archive toast and Undo for meetings and initiatives. |
| `src/components/ui/native-select.tsx` (create) | shadcn native select. |
| `src/features/initiatives/board.ts` (create) | Pure functions over the board's state: build, move, replace, and remove a card. |
| `src/features/initiatives/initiatives-page.tsx` (create) | Loads the board, owns the open sheet, and creates initiatives. |
| `src/features/initiatives/roadmap-board.tsx` (create) | The four columns and the drag context. |
| `src/features/initiatives/roadmap-column.tsx`, `initiative-card.tsx` (create) | One column, and one card. |
| `src/features/initiatives/announcements.ts` (create) | Screen reader messages for dragging. |
| `src/features/initiatives/initiative-sheet.tsx` (create) | Loads one initiative and shows its editor in the sheet. |
| `src/features/initiatives/initiative-form.tsx` (create) | Name, role, completion date, description, and Delete, with autosave and name conflicts. |
| `src/features/meetings/meeting-initiative-select.tsx` (create) | The "Initiative" row of the meeting details sidebar. |
| `src/components/app-sidebar.tsx`, `src/App.tsx` (modify) | The section and its route. |

---

### Task 1: Store initiatives on a roadmap in the backend

The backend slice. After this task, the database and the commands exist, and the user interface does not change. Re-apply the shape of `initiatives.rs` and of the `meetings.rs` changes from commit `159e476`. Replace its list order, its `update`, and its default name with the rules below.

**Files:**
- Modify: `src-tauri/src/db.rs`, `src-tauri/src/meetings.rs`, `src-tauri/src/lib.rs`, `docs/data-model.md`
- Create: `src-tauri/src/initiatives.rs`

**Interfaces:**
- Produces (`initiatives.rs`), all `Serialize` with `rename_all = "camelCase"`:
  - `pub struct Initiative { id: i64, name: String, description: String, raci_role: Option<String>, horizon: String, position: i64, created_at: String, updated_at: String, completed_at: Option<String>, archived_at: Option<String> }`
  - `pub struct InitiativeSummary`, with the same fields without `description`
  - `#[serde(tag = "status", rename_all = "camelCase")] pub enum RenameOutcome { Renamed { initiative: Initiative }, NameTaken }`
  - `#[serde(tag = "status", rename_all = "camelCase")] pub enum RestoreOutcome { Restored, NameTaken }`
  - `pub enum Error { NotFound(i64), InvalidRole(String), InvalidDestination(String), Archived(i64), Database(rusqlite::Error) }`, with these messages:
    - `initiative {id} not found`
    - `invalid RACI role "{role}": use responsible, accountable, consulted, or informed`
    - `invalid destination "{d}": use now, next, later, or done`
    - `initiative {id} is deleted`
    - `database error: {error}`
  - Functions:
    - `list(&Connection, include_archived: bool) -> Result<Vec<InitiativeSummary>, Error>`
    - `create(&Connection) -> Result<Initiative, Error>`
    - `get(&Connection, id: i64) -> Result<Option<Initiative>, Error>`
    - `rename(&Connection, id: i64, name: &str) -> Result<RenameOutcome, Error>`
    - `update(&Connection, id: i64, description: &str, raci_role: Option<&str>) -> Result<Initiative, Error>`
    - `move_to(&Connection, id: i64, destination: &str, index: i64) -> Result<(), Error>`
    - `archive(&Connection, id: i64) -> Result<(), Error>`
    - `unarchive(&Connection, id: i64) -> Result<RestoreOutcome, Error>`
- Produces (`meetings.rs`):
  - `Meeting.initiative_id: Option<i64>`
  - `Error::InitiativeNotFound(i64)`
  - `set_initiative(&Connection, id: i64, initiative_id: Option<i64>) -> Result<Meeting, Error>`
- Produces (`lib.rs`): the commands `list_initiatives(include_archived)`, `create_initiative`, `get_initiative(id)`, `rename_initiative(id, name)`, `update_initiative(id, description, raci_role)`, `move_initiative(id, destination, index)`, `archive_initiative(id)`, `unarchive_initiative(id)`, and `set_meeting_initiative(id, initiative_id)`. Each calls `Database::run` and has the `needless_pass_by_value` expectation.

- [ ] **Step 1: Write the failing Rust tests**

In `initiatives.rs`, add `fn column(conn, horizon) -> Vec<(String, i64)>` as a test helper. It reads the names and positions of the initiatives on the board in a column, ordered by position. `fn assert_dense(conn)` checks that every column has the positions 0 to n−1. Call `assert_dense` at the end of every test that changes the order. Tests:
- `create_puts_an_empty_initiative_at_the_top_of_later`: two creates give Later `[second, first]` at positions 0 and 1; the name is `""`, the description is `""`, the role is `None`, and `completed_at` and `archived_at` are `None`.
- `move_within_a_column_down_and_up`: in Now `[A, B, C]`, a move of A to index 2 gives `[B, C, A]`, and then a move of A to index 0 gives `[A, B, C]`.
- `move_to_another_column_closes_and_opens_gaps`
- `move_clamps_an_index_beyond_the_column`: index 99 puts the card last.
- `move_to_done_completes_and_keeps_the_last_place`: `completed_at` is set, `horizon` and `position` keep the old values, and the old column is dense. A second move to `done` keeps the first `completed_at`.
- `move_out_of_done_reopens_at_the_index`
- `move_refuses_a_deleted_initiative_and_an_unknown_destination`
- `archive_closes_the_gap_and_unarchive_puts_it_back`: Next `[A, B, C]`; archive B, then unarchive, gives `[A, B, C]`.
- `unarchive_into_a_shorter_column_puts_it_last`
- `archive_of_a_completed_initiative_changes_no_column`, and its unarchive returns it to Done.
- `rename_trims_and_saves`: `"  Launch "` is stored as `"Launch"`, and `updated_at` changes.
- `rename_returns_name_taken_for_the_same_name_in_another_case`, and nothing changes.
- `rename_to_own_name_in_another_case_is_allowed` (Review Focus 3)
- `names_of_deleted_initiatives_can_be_used_again`
- `completed_initiatives_keep_their_names`
- `empty_names_do_not_conflict`: two initiatives renamed to `"   "` are both stored as `""`.
- `unarchive_returns_name_taken_when_the_name_is_used`: it changes nothing.
- `the_database_refuses_a_second_active_initiative_with_the_same_name` (Review Focus 3): a direct `UPDATE ... SET name = 'launch'` fails while "Launch" exists, and so does an `UPDATE` that clears `archived_at` on a deleted duplicate.
- `update_saves_the_description_and_role_only`: the name, horizon, and position do not change.
- `update_refuses_an_unknown_role`, including `"Responsible"`.
- `the_database_refuses_unknown_roles_and_horizons`
- `list_leaves_out_deleted_initiatives_unless_asked`
- `operations_on_a_missing_initiative_return_not_found`

In `meetings.rs`:
- `a_new_meeting_has_no_initiative`
- `set_initiative_assigns_removes_and_changes_updated_at`
- `set_initiative_accepts_deleted_and_completed_initiatives`
- `set_initiative_refuses_a_missing_initiative`
- `set_initiative_on_a_missing_meeting_returns_not_found`
- `update_does_not_change_the_initiative`

In `db.rs`: `migration_4_keeps_meetings_and_tasks_and_assigns_no_initiative`. Apply `MIGRATIONS[..3]`, insert a meeting and a task, migrate, and check both are still there and the meeting's `initiative_id` is `None`.

- [ ] **Step 2: Run `bun run test:rust`.** Expected: it fails to compile, because the module, functions, and field are missing.

- [ ] **Step 3: Implement.** Migration 4:

```sql
CREATE TABLE initiatives (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    raci_role    TEXT CHECK (raci_role IN ('responsible', 'accountable', 'consulted', 'informed')),
    horizon      TEXT NOT NULL DEFAULT 'later' CHECK (horizon IN ('now', 'next', 'later')),
    position     INTEGER NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    completed_at TEXT,
    archived_at  TEXT
);
CREATE INDEX initiatives_horizon_position ON initiatives(horizon, position);
CREATE UNIQUE INDEX initiatives_name ON initiatives(name COLLATE NOCASE)
    WHERE archived_at IS NULL AND name <> '';
ALTER TABLE meetings ADD COLUMN initiative_id INTEGER REFERENCES initiatives(id);
CREATE INDEX meetings_initiative_id ON meetings(initiative_id);
```

Every function that changes the order runs in one transaction (`connection.unchecked_transaction()`, because the functions take `&Connection`). Closing a gap is `UPDATE ... SET position = position - 1 WHERE horizon = ?1 AND position > ?2 AND completed_at IS NULL AND archived_at IS NULL`, and opening a gap is the same with `+ 1` and `>=`. `rename` and `unarchive` check for a conflict with a `SELECT` using `COLLATE NOCASE` before they write. The index guards every other path. Keep the commands in `lib.rs` thin. Update the ERD and the column descriptions in `docs/data-model.md`, including the rule for positions and the unique index, and the relationship `initiatives |o--o{ meetings`.

- [ ] **Step 4: Run `bun run test:rust` and `bun run lint:rust`.** Expected: PASS with no warnings.

- [ ] **Step 5: Commit** with the message "Store initiatives on a roadmap and add the initiative commands".

---

### Task 2: Add the frontend data module for initiatives

After this task, the frontend has types and wrappers for every command. The user interface does not change. Re-apply `src/lib/initiatives.ts` from `159e476`, changed to the interfaces below.

**Files:**
- Create: `src/lib/initiatives.ts`, `src/lib/initiatives.test.ts`
- Modify: `src/lib/meetings.ts`, `src/lib/meetings.test.ts`

**Interfaces:**
- Consumes: the commands of Task 1.
- Produces (`src/lib/initiatives.ts`):
  - `type RaciRole = "responsible" | "accountable" | "consulted" | "informed"`
  - `type Horizon = "now" | "next" | "later"`
  - `type Column = Horizon | "done"`
  - `const COLUMNS: { id: Column; title: string }[]`, in the order Now, Next, Later, Done
  - `type Initiative = { id; name; description; raciRole: RaciRole | null; horizon: Horizon; position: number; createdAt; updatedAt; completedAt: string | null; archivedAt: string | null }`
  - `type InitiativeSummary = Omit<Initiative, "description">`
  - `const DEFAULT_INITIATIVE_NAME = "Untitled initiative"`
  - `const RACI_ROLES: { value: RaciRole; label: string }[]` and `raciRoleLabel(role: RaciRole): string`
  - `initiativeDisplayName(name: string): string`, which returns the default name when the trimmed name is empty
  - `type RenameResult = { status: "renamed"; initiative: Initiative } | { status: "nameTaken" }`
  - `type RestoreResult = { status: "restored" } | { status: "nameTaken" }`
  - `type ChoiceGroup = { label: string; choices: { id: number; label: string }[] }` and `initiativeChoiceGroups(all: InitiativeSummary[]): ChoiceGroup[]`
  - Wrappers:
    - `listInitiatives({ includeArchived }): Promise<InitiativeSummary[]>`
    - `createInitiative(): Promise<Initiative>`
    - `getInitiative(id): Promise<Initiative | null>`
    - `renameInitiative(id, name): Promise<RenameResult>`
    - `updateInitiative(id, { description, raciRole }): Promise<Initiative>`
    - `moveInitiative(id, destination: Column, index: number): Promise<void>`
    - `archiveInitiative(id): Promise<void>`
    - `unarchiveInitiative(id): Promise<RestoreResult>`
- Produces (`src/lib/meetings.ts`): `Meeting.initiativeId: number | null` and `setMeetingInitiative(id, initiativeId: number | null): Promise<Meeting>`.

- [ ] **Step 1: Write the failing tests.** In `initiatives.test.ts`, mock `invoke` as `meetings.test.ts` does:
  - Each wrapper calls its command with camelCase arguments, such as `invoke("move_initiative", { id: 3, destination: "done", index: 0 })`.
  - `initiativeDisplayName("  ")` returns `"Untitled initiative"`.
  - `initiativeChoiceGroups` does the following:
    - It groups by Now, Next, and Later, sorted by position and then by id.
    - "Completed" holds the completed initiatives that are not deleted, sorted with `localeCompare(b, undefined, { sensitivity: "base" })` on the shown name.
    - "Deleted" holds all deleted initiatives, sorted in the same way.
    - It leaves out empty groups.
    - It uses "Untitled initiative" for empty names.

  In `meetings.test.ts`, add `setMeetingInitiative` calling `set_meeting_initiative` with `{ id, initiativeId }`.
- [ ] **Step 2: Run `bun run test src/lib`.** Expected: FAIL, because the module is missing.
- [ ] **Step 3: Implement.** Add `initiativeId: null` to any meeting fixtures in unit tests that type check `Meeting`.
- [ ] **Step 4: Run `bun run check`.** Expected: PASS, apart from the new executable specs.
- [ ] **Step 5: Commit** with the message "Add the frontend data module for initiatives".

---

### Task 3: Share the Markdown editor, autosave, and save status

A refactor inside the feature: no behavior changes, and the meeting specs stay untouched and green. Re-apply commit `fc2dc81` without `details-sidebar.tsx`. `MeetingDetailsSidebar` stays in `src/features/meetings/`.

**Files:**
- Move: `src/features/meetings/notes-editor.tsx` to `src/components/markdown-editor/markdown-editor.tsx`, together with its test, `link-popover.tsx`, and `link-shortcut.ts`
- Move: `use-autosave.ts` and its test to `src/hooks/`, and `save-status.tsx` to `src/components/`
- Modify: `meeting-editor.tsx`, `src/features/tasks/action-item-row.tsx`, and any CSS selectors in `src/index.css` that name the notes editor

**Interfaces:**
- Produces: `MarkdownEditor` with the props of `NotesEditor` plus `label: string`, the accessible name of the text area. The meeting editor passes `"Notes"`. `useAutosave`, `AUTOSAVE_DELAY_MS`, `AutosaveStatus`, and `SaveStatus` do not change.

- [ ] **Step 1:** Move the files with `git mv`, rename the component and its test's `describe`, and add the `label` prop, replacing the hard-coded "Notes". Update the imports.
- [ ] **Step 2:** Add a unit test to `markdown-editor.test.tsx` showing that `label="Description"` names the text box "Description".
- [ ] **Step 3: Run `bun run check`.** Expected: PASS, apart from the new executable specs, with no changes to any `*.spec.tsx`.
- [ ] **Step 4: Commit** with the message "Share the Markdown editor, autosave, and save status".

---

### Task 4: Share the archive provider between meetings and initiatives

After this task, the provider can delete and restore initiatives, and the meeting behavior is unchanged. Re-apply the provider part of commit `459a05a`. Leave out `archivable-list.tsx`, and add the delete wording and the name conflict result.

**Files:**
- Move: `src/features/meetings/archive-provider.tsx`, `archive-provider.test.tsx`, and `use-archive.ts` to `src/components/`
- Modify: `src/App.tsx`, `meetings-page.tsx`, `meeting-editor.tsx`, and the tests that import the moved files

**Interfaces:**
- Produces (`src/components/use-archive.ts`):
  - `type ArchiveKind = "meeting" | "initiative"`
  - `type ItemToArchive = { kind: ArchiveKind; id: number; name: string }`
  - `type RestoredItem = { kind: ArchiveKind; id: number }`
  - `ArchiveApi = { archive(item: ItemToArchive): Promise<void>; version: number; restored: RestoredItem | null }`
- Kinds, held in one table inside the provider:

  | Kind | Commands | Shown name | Toast | Restore failure text |
  | --- | --- | --- | --- | --- |
  | `meeting` | `archiveMeeting`, `unarchiveMeeting` | `displayName` | `Archived "<name>".` | "Couldn't restore the meeting. Try again." |
  | `initiative` | `archiveInitiative`, `unarchiveInitiative` | `initiativeDisplayName` | `Deleted "<name>".` | "Couldn't restore the initiative. Try again." |

  When `unarchiveInitiative` returns `nameTaken`, the toast text becomes `Couldn't restore "<name>" because another initiative has that name.`, and the toast has no action button.

- [ ] **Step 1: Write the failing tests** in `archive-provider.test.tsx`:
  - An initiative shows `Deleted "Launch".` and Undo calls `unarchive_initiative`.
  - A `nameTaken` result shows the conflict text with no "Undo" button.
  - Archiving an initiative closes an open meeting toast.
  - `restored` carries the kind. A page that watches for a restored meeting ignores a restored initiative with the same id (Review Focus 4).
- [ ] **Step 2: Run the provider tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Meetings pass `kind: "meeting"`, and the Meetings page reacts only to `restored?.kind === "meeting"`.
- [ ] **Step 4: Run `bun run check`.** Expected: PASS, apart from the new executable specs.
- [ ] **Step 5: Commit** with the message "Share the archive provider between meetings and initiatives".

---

### Task 5: Show initiatives on a roadmap

After this task, the user can open the Initiatives section and see the board, without a sheet or dragging. Turns green in `roadmap.spec.tsx`:
- "Initiatives section"
- in "Roadmap", every test except the two that open a sheet

**Files:**
- Create: `src/features/initiatives/board.ts`, `board.test.ts`, `initiatives-page.tsx`, `roadmap-board.tsx`, `roadmap-column.tsx`, `initiative-card.tsx`
- Modify: `src/components/app-sidebar.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `listInitiatives`, `COLUMNS`, `initiativeDisplayName`, and `raciRoleLabel`.
- Produces (`board.ts`):
  - `type Board = Record<Column, InitiativeSummary[]>`
  - `buildBoard(summaries): Board`: Now, Next, and Later by position and then id; Done by `completedAt` descending
  - `columnOf(board, id): Column | null`
  - `moveCard(board, id, to: Column, index: number): Board`: moving to Done puts the card first and ignores the index
  - `replaceCard(board, summary): Board`: keeps the place
  - `removeCard(board, id): Board`
- Produces (components):
  - `InitiativesPage`
  - `RoadmapBoard({ board, onOpen(id) })`
  - `RoadmapColumn({ column, cards, onOpen })`
  - `InitiativeCard({ initiative, done, onOpen })`

- [ ] **Step 1: Write the failing unit tests** in `board.test.ts`, one for each function and ordering rule above, including a move inside Done that leaves Done unchanged.
- [ ] **Step 2: Run `bun run test src/features/initiatives`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add the section `{ title: "Initiatives", path: "/initiatives", icon: TargetIcon }` and the route `/initiatives`.
  - The page is a grid with the page header and the board.
  - The board is a grid of four equal columns, `grid-cols-4`, in a row sized `minmax(0,1fr)`.
  - Each column is a `<section aria-label="<Title>">` with an `<h2>`, which holds the title and a count in a muted `<span>`, and a list area that scrolls, with `min-h-0` and `overflow-y-auto`.
  - A card is a `<button>` as wide as its list. It holds the shown name, then a small badge with the role label when a role is set. In Done it also holds a `CheckIcon` with `aria-hidden`, and its text is muted.
  - While the board loads, each column shows its heading and no cards. A load failure replaces the board with "Couldn't load initiatives" and "Retry".
- [ ] **Step 4: Run `bun run test src/features/initiatives/roadmap.spec.tsx`.** Expected: the tests listed above PASS. Run `bun run check`: PASS, apart from the remaining new specs.
- [ ] **Step 5: Commit** with the message "Show initiatives on a roadmap".

---

### Task 6: Edit and create initiatives in a sheet

After this task, a card opens its sheet, edits autosave, name conflicts show, and "New initiative" works. Turns green:
- the two sheet tests left in "Roadmap", and "Creating an initiative", in `roadmap.spec.tsx`
- "The sheet", "Saving", and "Unique names" in `initiative-sheet.spec.tsx`
- "scrolls only a long description in the sheet" and "shows the sheet at the right…" in `roadmap.browser.spec.tsx`

Re-apply `native-select.tsx` from `ae1c1f5`, or add it again with the shadcn command. Borrow the field layout from `initiative-editor.tsx` in `ae1c1f5`, but not its page, sidebar, or combined save.

**Files:**
- Create: `src/components/ui/native-select.tsx`, `src/features/initiatives/initiative-sheet.tsx`, `initiative-form.tsx`, `initiative-form.test.tsx`
- Modify: `initiatives-page.tsx`

**Interfaces:**
- Consumes: `getInitiative`, `renameInitiative`, `updateInitiative`, `createInitiative`, `MarkdownEditor`, `useAutosave`, `SaveStatus`, `replaceCard`, and `useFailureToast`.
- Produces:
  - `InitiativeSheet({ id: number | null; onClose(): void; onSaved(summary: InitiativeSummary): void; onDeleted(id): void })`. `id === null` means the sheet is closed.
  - `InitiativeForm({ initiative, onSaved, onDelete })`
  - `InitiativesPage` holds `openId` and `focusNameOnOpen`.

- [ ] **Step 1: Write the failing unit tests** in `initiative-form.test.tsx`:
  - A rename that answers `nameTaken` sets `aria-invalid` and the message, and still calls `updateInitiative` for a changed role.
  - A later successful rename clears the message.
  - For Review Focus 5, unmount the form while a rename is pending. Resolve it with `nameTaken`: no React warning, and `onSaved` is not called. Resolve it with `renamed`: `onSaved` is called with the new name.
- [ ] **Step 2: Run the unit test and the spec tests listed above.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Sheet:** use `Sheet` with `open={id !== null}` and `onOpenChange`, and `SheetContent side="right"` with its built-in close button. Leave room at the right of the header row so the button does not cover the save status.
    - Width: 40rem, or the window width if smaller, overriding `sm:max-w-sm`.
    - Layout: a grid whose rows are the header, the role, the completion line, the toolbar and description with `minmax(0,1fr)`, and the footer.
    - Header: a visually hidden `SheetTitle` with the saved shown name, then the name `Input` with `aria-label="Initiative name"` and the placeholder, then `SaveStatus`.
  - **Form:** one `useAutosave` over `{ name, description, raciRole }`. Its save function:
    - calls `renameInitiative` when the name differs from the last saved name
    - sets or clears the conflict message from the result
    - calls `updateInitiative` when the description or role differs
    - calls `onSaved` with each saved initiative

    A conflict is a result, not a thrown error, so the save status does not show "Couldn't save". Keep the "last saved" values in refs so they survive unmount. Never set state after unmount.
  - **Messages:** the conflict message is a `<p id=…>` below the name field and is linked with `aria-describedby`. "Couldn't load the initiative" and "Retry" show in the sheet when `getInitiative` fails.
  - **Create:** "New initiative" disables itself, calls `createInitiative`, reloads the board, and opens the sheet with focus in the name field. Use `initialFocus` on the popup. On failure, it shows a failure toast.
  - **Closing:** Base UI returns focus to the card when the sheet closes.
- [ ] **Step 4: Run `bun run check`.** Expected: PASS, apart from the remaining new specs.
- [ ] **Step 5: Commit** with the message "Edit and create initiatives in a sheet".

---

### Task 7: Delete an initiative with Undo

Turns green: "Deleting an initiative" in `initiative-sheet.spec.tsx`.

**Files:**
- Modify: `initiative-form.tsx`, `initiative-sheet.tsx`, `initiatives-page.tsx`

**Interfaces:**
- Consumes: `useArchive().archive({ kind: "initiative", id, name })`, `restored`, `version`, and `removeCard`.

- [ ] **Step 1: Run the delete tests.** Expected: FAIL.
- [ ] **Step 2: Implement.**
  - "Delete" first saves any change that is waiting. Unmounting the form does this through `useAutosave`, so close the sheet only after `archive` resolves, and pass the name that is in the field now.
  - When `archive` resolves, close the sheet, remove the card, and focus "New initiative".
  - When it rejects, show "Couldn't delete the initiative. Try again." and keep the sheet open.
  - When `version` changes, the page reloads the board. When `restored` names an initiative, it focuses that card after the reload.
- [ ] **Step 3: Run `bun run check`.** Expected: PASS, apart from the remaining new specs.
- [ ] **Step 4: Commit** with the message "Delete initiatives from the sheet with Undo".

---

### Task 8: Drag cards between and within columns

Turns green: the "Dragging cards with the pointer", "Dragging cards with the keyboard", and "Layout" tests in `roadmap.browser.spec.tsx`.

**Files:**
- Create: `src/features/initiatives/announcements.ts`, `announcements.test.ts`
- Modify: `package.json`, `bun.lock`, `roadmap-board.tsx`, `roadmap-column.tsx`, `initiative-card.tsx`, `initiatives-page.tsx`

**Interfaces:**
- Consumes: `moveCard`, `columnOf`, `buildBoard`, `moveInitiative`, and `useFailureToast`.
- Produces: `announcements(nameOf: (id) => string): Announcements`, the dnd-kit `Announcements` object with the five messages. `RoadmapBoard` gains `onMove(id, to: Column, index: number)`.

- [ ] **Step 1: Write the failing unit tests** in `announcements.test.ts`. Build fake `active` and `over` objects with `data.current.sortable.containerId` and `index`, and check the exact texts, including "position 2 of 3" and `A was completed.` for a drop in Done.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Setup:** run `bun add @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2`.
  - **Sensors:** one `DndContext` with `closestCorners` and two sensors:
    - `PointerSensor` with `activationConstraint: { distance: 8 }`
    - `KeyboardSensor` with `coordinateGetter: sortableKeyboardCoordinates` and `keyboardCodes: { start: ["Space"], end: ["Space"], cancel: ["Escape"] }`
  - **Columns:** each column is a `SortableContext` with `verticalListSortingStrategy` and `id` equal to the column id. The whole list area, also when empty, is a `useDroppable` with that id.
  - **Cards:** each card uses `useSortable({ id, data: { column } })`. Cards fill the list width, because the keyboard coordinates compare left edges. If ArrowLeft or ArrowRight still stays in the same column, write a coordinate getter that skips the current column.
  - **During a drag:** `onDragOver` moves the card across columns in local state, as in the dnd-kit multiple containers example. Over Done, the card shows first.
  - **On drop:** `onDragEnd` computes the final column and index, updates the state, and calls `onMove`.
  - **Saving a move:** the page calls `moveInitiative`. On failure, it shows "Couldn't move the initiative. Try again." and reloads the board from the backend (Review Focus 1). Add a jsdom test in `initiatives-page.test.tsx` that calls `onMove` twice through a stubbed board, fails the first, and checks that the board equals the backend.
  - **Messages:** pass `accessibility={{ announcements: announcements(nameOf) }}`. Read the column and index from `over`, not from state.
  - **Focus:** after a keyboard drop, keep focus on the card. dnd-kit restores it by default. Keep that on.
- [ ] **Step 4: Run `bunx vitest run --project browser src/features/initiatives` three times.** Expected: PASS every time. Then run `bun run check`: PASS, apart from `meeting-initiative.spec.tsx`.
- [ ] **Step 5: Commit** with the message "Drag roadmap cards with the pointer and the keyboard".

---

### Task 9: Assign a meeting to an initiative

Turns green: all of `meeting-initiative.spec.tsx`. Re-apply `meeting-initiative-select.tsx` and its test from `1ab540d` and `36798a7`, including the handling of saves that are superseded or that answer out of order. Replace the flat choices with `<optgroup>`s from `initiativeChoiceGroups`.

**Files:**
- Create: `src/features/meetings/meeting-initiative-select.tsx`, `meeting-initiative-select.test.tsx`
- Modify:
  - `src/features/meetings/meeting-editor.tsx`
  - the fake backends of the existing meeting, task, section, and App tests listed by `grep -rl "list_meeting_tasks\|list_meetings" src`, which gain a `list_initiatives` case returning `[]`, and an `initiativeId: null` field on seeded meetings where the fake returns full meetings

**Interfaces:**
- Consumes: `listInitiatives({ includeArchived: true })`, `initiativeChoiceGroups`, `setMeetingInitiative`, and `useFailureToast`.
- Produces: `MeetingInitiativeSelect({ meetingId: number; initiativeId: number | null })`, a labeled row for the `properties` of `MeetingDetailsSidebar`, placed after the Date row.

- [ ] **Step 1: Write the failing unit tests.** Carry over the old tests, with grouped choices. Keep the old test for two quick choices where the first fails after the second succeeds: the select keeps the second.
- [ ] **Step 2: Run them and the spec.** Expected: FAIL.
- [ ] **Step 3: Implement,** and update the fakes of the existing tests. Only the fakes may change in those files.
- [ ] **Step 4: Run `bun run check`.** Expected: PASS, with every test green, including all four executable spec files.
- [ ] **Step 5: Commit** with the message "Assign a meeting to an initiative from the meeting details sidebar".
