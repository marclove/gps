# Meetings That Cover Several Initiatives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a meeting cover any number of initiatives of its project. The links are stored in a new table `meeting_initiatives`, and the user chooses them with checkboxes in a popover in the meeting details sidebar.

**Architecture:** The work goes in three vertical slices. Each slice leaves the application working.

1. The first slice moves the storage. A migration creates `meeting_initiatives`, copies each meeting's `initiative_id` into it, and removes the column. The backend then reads and writes links. The existing select box keeps working on top of the links, and the move of an initiative follows the new rule.
2. The second slice adds the commands `add_meeting_initiative` and `remove_meeting_initiative` and their frontend functions.
3. The third slice replaces the select box with the "Initiatives" row and its popover. It also removes `set_meeting_initiative` and the code that only the select box used.

**Tech Stack:** Rust with `rusqlite` and `rusqlite_migration`; React 19 with TypeScript; shadcn `popover` and `checkbox` on Base UI (already in `src/components/ui/`); Vitest with React Testing Library in jsdom.

**Spec:** `docs/specs/0009-meetings-cover-several-initiatives.md`, argued in `docs/adrs/0021-store-the-initiatives-of-a-meeting-in-a-link-table.md` and `docs/adrs/0022-choose-the-initiatives-of-a-meeting-in-a-popover-with-checkboxes.md`. Read all three before you start a task.

The executable specs and their shared fake backend are already written. Do not change them to make them pass:
- `src/features/meetings/meeting-initiatives.spec.tsx`
- `src/features/meetings/meeting-project.spec.tsx`
- `src/features/initiatives/initiative-project.spec.tsx`
- `src/test/fake-roadmap-backend.ts`

If one of them seems wrong, stop and ask a human. The executable specs pass only after Task 3. Every other test, and `bun run typecheck`, `bun run lint`, `bun run fmt:check`, `bun run lint:rust`, `bun run fmt:rust:check`, and `bun run test:rust`, must pass after every task.

## Global Constraints

- **Commands and results** are exactly as in "Backend contract" of the spec. Arguments and fields are camelCase on the frontend and snake_case in Rust, with `#[serde(rename_all = "camelCase")]`. A meeting has `initiativeIds: number[]` (Rust `initiative_ids: Vec<i64>`). It lists every link, also to deleted initiatives, in ascending order of identifier.
- **Exact copy:**
  - Row and list: "Initiatives", "Choose", "No initiatives", "Couldn't load initiatives", "Retry".
  - Popover: "This project has no initiatives.", " (deleted)", "Untitled initiative".
  - Failure toasts: "Couldn't add the initiative. Try again.", "Couldn't remove the initiative. Try again."
  - Accessible names: the button is "Choose initiatives", the popover is a dialog named "Choose initiatives", and the list is "Meeting initiatives".
- **Sorting:** sort initiatives by shown name with `localeCompare(…, undefined, { sensitivity: "base" })`, the existing `byLabel` in `src/lib/initiatives.ts`. The shown name includes " (deleted)".
- **Migrations:** the entries in `MIGRATIONS` in `db.rs` do not change. The new one goes after them and ends with `.foreign_key_check()`.
- **The rule of the project**, which the backend enforces in one transaction per command: every initiative that a meeting covers belongs to the project of the meeting. A meeting follows an initiative to another project only when it covers no other initiative. A link to a deleted initiative counts as another initiative.
- Public Rust items and exported TypeScript items get docstrings in ASD-STE100 style. Comments do not name sections of ADRs or plans.
- `docs/data-model.md` changes in the same commit as the migration.

## Review Focus

1. **The same checkbox clicked twice before the first save ends.** The user expects the last click to win: the checkbox and the backend end in the state of the last click, and an older reply does not flip the checkbox back. Task 3 tests this in `use-covered-initiatives.test.tsx`.
2. **One checkbox fails while another succeeds.** The user expects the failed one to go back and its toast to stay. A later success of another checkbox clears the toast only if no newer request failed. Task 3 tests this in `use-covered-initiatives.test.tsx`.
3. **The migration of deleted rows.** A deleted meeting with an initiative, and a meeting with a deleted initiative, keep their links. Tasks keep their meetings after the rebuild of `meetings`. Task 1 tests this in `db.rs`.
4. **Removing a link to a deleted initiative.** The backend must accept the removal, because the popover offers it. Task 2 tests this in `meetings.rs`.
5. **Adding a link that exists.** Nothing changes, not even `updated_at`. This matters because the frontend can send the same add twice after a quick uncheck and check. Task 2 tests this in `meetings.rs`.

---

### Task 1: Store the initiatives of a meeting in `meeting_initiatives`

After this task, the database has the link table, a meeting reports `initiativeIds`, and the select box of today still works on top of the links. The move of an initiative follows the new rule.

**Files:**
- Modify: `src-tauri/src/db.rs` (new migration and tests; two existing migration tests)
- Modify: `src-tauri/src/meetings.rs` (`Meeting`, `get`, `set_initiative`, `set_project`, and their tests)
- Modify: `src-tauri/src/initiatives.rs` (`set_project` and its tests)
- Modify: `src/lib/meetings.ts` (`Meeting` type)
- Modify: `src/features/meetings/meeting-editor.tsx` and `meeting-initiative-select.tsx` (read `initiativeIds`)
- Modify: every test fixture that builds a `Meeting` with `initiativeId` (`grep -rn "initiativeId" src`), except the files that must not change
- Modify: `docs/data-model.md`

**Interfaces:**
- Produces:
  - Rust `Meeting.initiative_ids: Vec<i64>`, which replaces `initiative_id`.
  - TypeScript `Meeting.initiativeIds: number[]`, which replaces `initiativeId`.
  - Table `meeting_initiatives(meeting_id, initiative_id, created_at)` with index `meeting_initiatives_initiative_id`.
  - `const VERSION_WITHOUT_MEETING_INITIATIVES: usize = 10` in the tests of `db.rs`.

- [ ] **Step 1: Write the failing migration test in `db.rs`.**

  Test `migration_copies_the_initiative_of_each_meeting_into_meeting_initiatives`:
  - Migrate to version 10. Insert:
    - project 1,
    - initiative 1 (not deleted) and initiative 2 (deleted), both in project 1,
    - meeting 1 with `initiative_id = 1` and `updated_at = 'u1'`,
    - meeting 2, deleted, with `initiative_id = 2` and `updated_at = 'u2'`,
    - meeting 3 with no initiative,
    - a task with `meeting_id = 1`.

    Then `apply` all migrations.
  - `SELECT meeting_id, initiative_id, created_at FROM meeting_initiatives ORDER BY meeting_id` returns `[(1, 1, "u1"), (2, 2, "u2")]`.
  - `pragma_table_info('meetings')` has no `initiative_id`.
  - `meetings.project_id` and `deleted_at` are unchanged.
  - The task still has `meeting_id = 1`.
  - `foreign_keys` is on.
  - Inserting `(1, 999, 't')` into `meeting_initiatives` fails.
  - Inserting `(1, 1, 't')` again fails, because of the primary key.
  - `SELECT count(*) FROM sqlite_master WHERE name = 'meetings_project_id'` is 1.

- [ ] **Step 2: Run it and see it fail.** Run `cargo test --manifest-path src-tauri/Cargo.toml migration_copies`. Expected: FAIL, because there is no table `meeting_initiatives`.

- [ ] **Step 3: Add the migration.**
  - Add `const ADD_MEETING_INITIATIVES: &str` and `M::up(ADD_MEETING_INITIATIVES).foreign_key_check()` at the end of `migrations()`.
  - The SQL does the following, in order:
    1. Creates `meeting_initiatives` (`meeting_id INTEGER NOT NULL REFERENCES meetings(id)`, `initiative_id INTEGER NOT NULL REFERENCES initiatives(id)`, `created_at TEXT NOT NULL`, `PRIMARY KEY (meeting_id, initiative_id)`) and the index `meeting_initiatives_initiative_id`.
    2. Runs `INSERT … SELECT id, initiative_id, updated_at FROM meetings WHERE initiative_id IS NOT NULL`.
    3. Rebuilds `meetings` as `meetings_new` with columns `id, name, notes, date, created_at, updated_at, deleted_at, project_id`, with the same types and defaults as today and `project_id INTEGER REFERENCES projects(id)`.
    4. Copies the rows, drops `meetings`, renames the new table, and runs `CREATE INDEX meetings_project_id ON meetings(project_id)`.
  - Follow `PUT_INITIATIVES_IN_PROJECTS` for the style.

- [ ] **Step 4: Fix the two older migration tests that read `meetings.initiative_id` after `apply`.** These are `migration_keeps_the_order_of_every_column_and_the_links_of_meetings` and `migration_puts_every_initiative_in_unsorted_and_gives_meetings_their_project`. Read the link from `meeting_initiatives` instead: `SELECT initiative_id FROM meeting_initiatives WHERE meeting_id = 1` is 1 and 2 respectively, and meeting 2 of the second test has no row. The commit message says that these tests changed because the column moved to a table.

- [ ] **Step 5: Change `meetings.rs` to read and write links.**
  - Change the doc comment of the module to say that a meeting covers initiatives of its project.
  - `Meeting.initiative_ids: Vec<i64>` is documented as "The identifiers of the initiatives that the meeting covers, also deleted ones, in ascending order."
  - `get` loads the meeting row, then runs `SELECT initiative_id FROM meeting_initiatives WHERE meeting_id = ?1 ORDER BY initiative_id`. `meeting_from_row` no longer reads column 6, and `project_id` moves to index 6.
  - `set_initiative` keeps its signature and its behavior for the select box. With `Some(initiative_id)`, it deletes the meeting's rows, inserts `(id, initiative_id, NOW)`, and sets `project_id` and `updated_at`. With `None`, it deletes the rows and sets `updated_at`. Task 3 removes this function.
  - `set_project` runs `DELETE FROM meeting_initiatives WHERE meeting_id = ?1` in its transaction when the project changes, in place of `initiative_id = NULL`.
  - Update the existing tests to use `initiative_ids`: `a_new_meeting_has_no_initiative`, `set_initiative_*`, `update_does_not_change_the_initiative`, and `set_project_clears_the_initiative_when_it_changes`. Keep their assertions, for example `assert_eq!(assigned.initiative_ids, vec![initiative.id])` and `assert!(removed.initiative_ids.is_empty())`.

- [ ] **Step 6: Write the failing tests for the move of an initiative in `initiatives.rs`.**
  - `set_project_moves_a_meeting_that_covers_only_that_initiative`: after the move, the meeting has the new `project_id`, still has `initiative_ids == [moved]`, and a new `updated_at`.
  - `set_project_keeps_a_meeting_that_covers_another_initiative`: the meeting covers the moved initiative and another one of the old project. After the move, `project_id` is the old project, `initiative_ids == [other]`, and `updated_at` is new.
  - `set_project_keeps_a_meeting_whose_other_initiative_is_deleted`: as the previous test, but the other initiative is deleted before the move.
  - Replace `set_project_moves_the_initiative_and_its_meetings` with the first of these tests. Add links with `INSERT INTO meeting_initiatives` in the test, or with `meetings::set_initiative` for a single link.

- [ ] **Step 7: Run them and see the last two fail.** Run `cargo test --manifest-path src-tauri/Cargo.toml set_project_`. Expected: the two "keeps" tests FAIL, because today every meeting of the initiative moves.

- [ ] **Step 8: Implement the move rule in `initiatives::set_project`.**
  - In the transaction, replace the single `UPDATE meetings … WHERE initiative_id = ?1` with three statements, in this order:
    1. `UPDATE meetings SET updated_at = NOW` for every meeting that links the initiative and has another link.
    2. `DELETE FROM meeting_initiatives WHERE initiative_id = ?1` for exactly those meetings. Use the same condition as statement 1, so it must run after statement 1 and before statement 3.
    3. `UPDATE meetings SET project_id = ?2, updated_at = NOW` for every meeting that still links the initiative. After statement 2, these are the meetings that link only this initiative.

    None of these statements depends on the initiative's own `project_id`, so they can run before or after the `UPDATE initiatives`.
  - Update the doc comment of `set_project`.

- [ ] **Step 9: Update the frontend type and its two readers.**
  - In `src/lib/meetings.ts`, `Meeting.initiativeIds: number[]` replaces `initiativeId`. Its docstring follows the Rust one.
  - In `meeting-editor.tsx`, `assignment` keeps `initiativeIds`. Give `MeetingInitiativeSelect` `initiativeId={assignment.initiativeIds[0] ?? null}`. This bridge disappears in Task 3.
  - Update each fixture that builds a `Meeting` or a meeting of a hand-written fake to `initiativeIds: []` (`grep -rn "initiativeId" src`). Do not touch the files that must not change.

- [ ] **Step 10: Update `docs/data-model.md`.**
  - Remove `initiative_id` from `meetings` in the diagram and from the description of `meetings`.
  - Add the entity `meeting_initiatives` with the three columns and the notes from the ticket's draft.
  - Replace the relationship `initiatives |o--o{ meetings` with `meetings ||--o{ meeting_initiatives : "covers"` and `initiatives ||--o{ meeting_initiatives : "is covered by"`.
  - Add a section `### meeting_initiatives` that describes the following:
    - the primary key and the index,
    - that a removal deletes the row,
    - the rule of the project, including what `add_meeting_initiative` and `set_initiative_project` do,
    - that the migration copied `initiative_id` with the meeting's `updated_at` as `created_at`.
  - In the sections on `meetings.project_id` and `initiatives.project_id`, replace "its meetings move with it" with the new move rule.

- [ ] **Step 11: Run all checks.** Run `bun run check`. Expected: everything passes except `meeting-initiatives.spec.tsx` and the first test of `meeting-project.spec.tsx`, which need Task 3.

- [ ] **Step 12: Commit.** Use the message "Store the initiatives of a meeting in meeting_initiatives", with a body that names the two migration tests that changed and why.

---

### Task 2: Add and remove the initiatives of a meeting

After this task, the backend has the two new commands and the frontend has functions for them. No screen uses them yet.

**Files:**
- Modify: `src-tauri/src/meetings.rs` (new functions, errors, tests)
- Modify: `src-tauri/src/lib.rs` (two commands, `generate_handler!`)
- Modify: `src/lib/meetings.ts` and `src/lib/meetings.test.ts`

**Interfaces:**
- Consumes: `Meeting.initiative_ids`, table `meeting_initiatives` (Task 1).
- Produces:
  - Rust:
    - `pub fn add_initiative(connection: &Connection, id: i64, initiative_id: i64) -> Result<Meeting, Error>`
    - `pub fn remove_initiative(connection: &Connection, id: i64, initiative_id: i64) -> Result<Meeting, Error>`
    - new `Error` variants `InitiativeDeleted(i64)` and `CoversOtherProject { meeting: i64, initiative: i64 }`
  - Commands: `add_meeting_initiative(id, initiative_id) -> Result<Meeting, String>` and `remove_meeting_initiative(id, initiative_id) -> Result<Meeting, String>`.
  - TypeScript:
    - `addMeetingInitiative(id: number, initiativeId: number): Promise<Meeting>`
    - `removeMeetingInitiative(id: number, initiativeId: number): Promise<Meeting>`

- [ ] **Step 1: Write the failing tests in `meetings.rs`.**
  - `add_initiative_adds_a_link_and_changes_updated_at`: the meeting is in project P and has no links. Adding initiative A of P gives `initiative_ids == [A]` and a new `updated_at`. Adding B gives `[A, B]`.
  - `add_initiative_of_a_covered_initiative_changes_nothing`: add A twice. The second result equals the first, including `updated_at`.
  - `add_initiative_accepts_a_completed_initiative`.
  - `add_initiative_refuses_a_deleted_initiative`: `Err(Error::InitiativeDeleted(id))`, and the meeting is unchanged.
  - `add_initiative_refuses_a_missing_initiative` returns `InitiativeNotFound`. `add_initiative_on_a_missing_meeting_returns_not_found` returns `NotFound`.
  - `add_initiative_gives_a_meeting_without_initiatives_the_project_of_the_initiative`: test a meeting with no project, and a meeting in project Q, each with no links. Adding A of P sets `project_id == Some(P)`.
  - `add_initiative_refuses_an_initiative_of_another_project_when_the_meeting_covers_one`: test a meeting in Q that covers C of Q, and a meeting in Q that covers only a deleted initiative of Q. Adding A of P returns `Err(Error::CoversOtherProject { .. })`, and nothing changes.
  - `remove_initiative_removes_the_link_and_changes_updated_at`: the project does not change, also when no link is left.
  - `remove_initiative_accepts_a_deleted_initiative`.
  - `remove_initiative_of_an_initiative_that_is_not_covered_changes_nothing`: `updated_at` is the same.
  - `remove_initiative_on_a_missing_meeting_returns_not_found`.

- [ ] **Step 2: Run them and see them fail.** Run `cargo test --manifest-path src-tauri/Cargo.toml _initiative`. Expected: FAIL with compile errors, because `add_initiative` and `remove_initiative` do not exist.

- [ ] **Step 3: Implement `add_initiative` and `remove_initiative`.**
  - Each runs in `connection.unchecked_transaction()`, as `set_project` does.
  - Add `Display` texts for the new errors:
    - "initiative {id} is deleted"
    - "meeting {meeting} covers initiatives of another project than initiative {initiative}"
  - `add_initiative` checks, in this order:
    1. the meeting exists,
    2. the initiative exists and is not deleted,
    3. the link already exists, in which case it returns the meeting unchanged,
    4. the projects differ (the meeting's `project_id != Some(initiative project)`). If the meeting has links, it refuses. Otherwise it sets `project_id`.

    Then it inserts the row with `NOW` and sets `updated_at`.
  - `remove_initiative` checks that the meeting exists, then deletes the row. It sets `updated_at` only if a row was deleted.

- [ ] **Step 4: Add the commands in `lib.rs`.** Follow the command pattern of `set_meeting_project`, with `#[expect(clippy::needless_pass_by_value)]`. Add both to `generate_handler!` next to `set_meeting_initiative`.

- [ ] **Step 5: Write the failing frontend test.** In `src/lib/meetings.test.ts`, add `["add_meeting_initiative", { id: 3, initiativeId: 7 }]` and `["remove_meeting_initiative", { id: 3, initiativeId: 7 }]` to the table of expected `invoke` calls. Run `bun run test src/lib/meetings.test.ts`. Expected: FAIL, because the functions do not exist.

- [ ] **Step 6: Add `addMeetingInitiative` and `removeMeetingInitiative` to `src/lib/meetings.ts`.** Each docstring states the backend rules from the spec's contract.

- [ ] **Step 7: Run all checks.** Run `bun run check`. Expected: as after Task 1.

- [ ] **Step 8: Commit.** Use the message "Add commands that add and remove the initiatives of a meeting".

---

### Task 3: Choose the initiatives of a meeting in a popover

After this task, the sidebar shows the "Initiatives" row, all executable specs pass, and the single initiative is gone from the code.

**Files:**
- Create: `src/features/meetings/use-covered-initiatives.ts` and `use-covered-initiatives.test.tsx`
- Create: `src/features/meetings/meeting-initiatives-picker.tsx`
- Delete: `src/features/meetings/meeting-initiative-select.tsx` and `meeting-initiative-select.test.tsx`
- Modify: `src/features/meetings/meeting-editor.tsx` and `meeting-editor-page.test.tsx`
- Modify: `src/lib/initiatives.ts` and `initiatives.test.ts`
- Modify: `src/lib/meetings.ts` and `meetings.test.ts` (remove `setMeetingInitiative`)
- Modify: `src-tauri/src/meetings.rs` and `lib.rs` (remove `set_initiative` and `set_meeting_initiative`, and their tests)
- Modify: `src/test/setup.ts`, only if Base UI needs a browser API that jsdom lacks

**Interfaces:**
- Consumes: `addMeetingInitiative` and `removeMeetingInitiative` (Task 2), `Meeting.initiativeIds` (Task 1), and `useChoices` and `useFailureToast`, which exist.
- Produces:
  - `useCoveredInitiatives({ meetingId: number; initial: number[] }): { checked: ReadonlySet<number>; linked: ReadonlySet<number>; toggle: (initiativeId: number, cover: boolean) => Promise<void> }`
    - `checked` is what the checkboxes show.
    - `linked` is `checked` plus every identifier that the backend still links or that has a request in flight. The popover uses `linked` to decide which deleted initiatives to offer.
  - `initiativeChoices(all: InitiativeSummary[], projectId: number | null, linked: ReadonlySet<number>): InitiativeChoice[]` in `src/lib/initiatives.ts`. It returns the initiatives of the project that are not deleted, plus the deleted ones in `linked`. Each label is `initiativeDisplayName(name)`, plus `" (deleted)"` for a deleted one. The choices are sorted with `byLabel`. When `projectId` is `null`, it returns no choices.
  - `MeetingInitiativesPicker({ meetingId: number; projectId: number | null; initiativeIds: number[] })`.

- [ ] **Step 1: Write the failing hook tests in `use-covered-initiatives.test.tsx`.**
  - Mock `@tauri-apps/api/core` with `vi.hoisted`. Render the hook in a `FailureToastProvider` with `renderHook`. Control each `invoke` with a deferred promise.
  - `shows a toggle at once and keeps it when the save succeeds`
  - `goes back and shows the failure toast when an add fails`: the text is "Couldn't add the initiative. Try again.".
  - `goes back and shows the failure toast when a removal fails`: the text is "Couldn't remove the initiative. Try again.".
  - `keeps the last click when two clicks on one initiative end in the other order`: check, then uncheck. The second reply comes first and the first reply comes later. `checked` does not contain the ID.
  - `goes back to the state of the older save when the newer one fails`: check succeeds, then uncheck fails. `checked` contains the ID.
  - `keeps the failure toast when a later toggle of another initiative succeeds after the failure`, and `clears the failure toast when a toggle that started after the failure succeeds`.
  - `keeps a removed initiative in linked until its removal is saved`.

- [ ] **Step 2: Run them and see them fail.** Run `bun run test src/features/meetings/use-covered-initiatives.test.tsx`. Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement `useCoveredInitiatives`.**
  - Keep the following for each initiative ID:
    - the saved state, with the number of the request that saved it,
    - the number of the latest request,
    - the numbers of the requests in flight.
  - Apply the rules of `useImmediateSave` to each ID independently:
    - An older reply that ends after a newer one does not replace the newer state.
    - When the latest request fails, the checkbox goes back to the saved state.
    - A success clears the toast only if no request that started later has failed.
  - Use one request counter for all IDs, so that the toast rule compares requests across initiatives.
  - The failure text depends on the direction of the failed request.

- [ ] **Step 4: Run the hook tests.** Expected: PASS.

- [ ] **Step 5: Replace the choice helpers in `src/lib/initiatives.ts`.**
  - Add `initiativeChoices`, and tests in `initiatives.test.ts`:
    - the choices are sorted alphabetically without regard to case,
    - a completed initiative is included,
    - a deleted one is included only when it is in `linked`, with " (deleted)",
    - another project is excluded,
    - a `null` project gives `[]`.
  - Remove `initiativeChoiceGroups`, `deletedInitiativeChoices`, `ChoiceGroup`, and their tests.

- [ ] **Step 6: Build `MeetingInitiativesPicker` in `meeting-initiatives-picker.tsx`.**
  - Load `listInitiatives({ includeDeleted: true })` with `useChoices`, keyed on `projectId` as `MeetingInitiativeSelect` does.
  - While loading, show the row with the button disabled. When loading fails, show "Couldn't load initiatives" with "Retry", in place of the button and the list.
  - The first line has a label "Initiatives" and the `Popover` trigger `Button`. The button has `variant="outline"` and `size="sm"`, the text "Choose", `aria-label="Choose initiatives"`, and is disabled when `projectId === null` or while loading.
  - Below the first line:
    - when `checked` is empty, a `<p>` "No initiatives",
    - otherwise a `<ul aria-label="Meeting initiatives">` of the choices whose ID is in `checked`, in the order of `initiativeChoices`.
  - Long names wrap (`break-words`, `min-w-0`) and do not widen the sidebar.
  - The `PopoverContent` has `aria-label="Choose initiatives"` and `align="end"`.
    - It holds one `<label>` per choice, which wraps a `Checkbox` and its text. The checkbox has `checked={checked.has(id)}` and `onCheckedChange={(value) => void toggle(id, value)}`.
    - The list scrolls inside `max-h-80 overflow-y-auto`.
    - With no choices, it shows "This project has no initiatives.".
  - Give the component a docstring like the one of `MeetingInitiativeSelect`, which it replaces.
  - If the Base UI popover or checkbox fails in jsdom because an API is missing, add a minimal stub to `src/test/setup.ts` with a comment that names this component.

- [ ] **Step 7: Use the picker in `meeting-editor.tsx`.**
  - `assignment` becomes `{ projectId, initiativeIds }`.
  - `MeetingProjectSelect`'s `onSaved` stores `saved.initiativeIds`.
  - Render `<MeetingInitiativesPicker key={assignment.projectId ?? "none"} meetingId=… projectId=… initiativeIds=… />` in place of `MeetingInitiativeSelect`.
  - Update the docstring of `MeetingEditor`.
  - Delete `meeting-initiative-select.tsx` and its test.
  - In `meeting-editor-page.test.tsx`, the tab order test expects the "Choose initiatives" button after the project select box, in place of the "Meeting initiative" select box.

- [ ] **Step 8: Run the executable specs.** Run `bunx vitest run --project unit src/features/meetings/meeting-initiatives.spec.tsx src/features/meetings/meeting-project.spec.tsx src/features/initiatives/initiative-project.spec.tsx`. Expected: PASS.

- [ ] **Step 9: Remove the single initiative command.**
  - Remove `setMeetingInitiative` and its test rows from `src/lib/meetings.ts` and `meetings.test.ts`.
  - Remove `set_meeting_initiative` from `lib.rs` and `generate_handler!`.
  - Remove `meetings::set_initiative`. Move the tests that used it for setup to `add_initiative`, or to an `INSERT INTO meeting_initiatives`.
  - Remove `Error` variants that no code uses any more. Clippy reports them.
  - Check that `grep -rn "set_meeting_initiative\|setMeetingInitiative\|MeetingInitiativeSelect\|initiativeChoiceGroups" src src-tauri/src` returns nothing.

- [ ] **Step 10: Run all checks.** Run `bun run check`. Expected: everything passes, including every executable spec.

- [ ] **Step 11: Commit.** Use the message "Choose the initiatives of a meeting in a popover with checkboxes".

---

### After the last task

- [ ] Run `bun run check` on the branch one more time, and run the app with `bun run tauri dev`. Open a meeting, choose and remove initiatives, change the project, and move an initiative on the roadmap. Check that the popover fits in the sidebar at the narrowest window width.
- [ ] Push, and convert draft PR #20 to an open PR. The PR description names ADRs 0021 and 0022, Spec 0009, the migration, and the removed command.
