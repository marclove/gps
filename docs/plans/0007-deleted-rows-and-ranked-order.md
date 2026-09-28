# Deleted Rows and Ranked Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `archived_at` to `deleted_at` in `meetings` and `initiatives` through every layer, say "Delete" for meetings in the user interface, and replace the dense `position` of initiatives with a text `rank` that a move writes for one row only.

**Architecture:** The work goes in two vertical slices. The first slice renames the column, the Rust functions, the backend commands, the frontend functions, and the shared toast provider, and then changes the words for meetings. The second slice adds a module `rank.rs` that wraps the crate `fractional_index`, changes how `db.rs` applies migrations so that a migration can rebuild a table that other tables refer to, and then replaces `position` with `rank` in the database, the backend, the interface between frontend and backend, and the frontend.

**Tech Stack:** Rust with `rusqlite` 0.40, `rusqlite_migration` 2.6, and `fractional_index` 2; React 19 with TypeScript; Vitest with React Testing Library in jsdom, and Vitest browser mode in WebKit.

**Spec:** `docs/specs/0007-deleted-rows-and-ranked-order.md`, argued in `docs/adrs/0017-mark-deleted-rows-and-order-cards-by-rank.md`. Read both before you start a task.

The executable specs and their shared fake backend are already written and must not change to make them pass:
- `src/features/meetings/delete.spec.tsx`
- `src/features/meetings/delete.browser.spec.tsx`
- `src/features/initiatives/roadmap.spec.tsx`
- `src/features/initiatives/initiative-sheet.spec.tsx`
- `src/features/initiatives/roadmap.browser.spec.tsx`
- `src/features/meetings/meeting-initiative.spec.tsx`
- `src/features/tasks/action-items.spec.tsx`
- `src/features/tasks/action-items.browser.spec.tsx`
- `src/test/fake-roadmap-backend.ts`

If one of them seems wrong, stop and ask a human. The specs pass only after the last task. Every other test must pass after every task.

## Global Constraints

- **Command names:** `delete_meeting`, `restore_meeting`, `delete_initiative`, `restore_initiative`. `list_initiatives` takes `includeDeleted`. No command, function, type, component, or file keeps the word "archive", except the file names of Spec 0004 and ADR 0008, which are merged and do not change.
- **Fields sent to the frontend:** an initiative has `rank: string` and `deletedAt: string | null`, and no `position` or `archivedAt`.
- **Exact copy for meetings:** button `Delete "<name>"` in the list, button "Delete" in the meeting details sidebar, both with `Trash2Icon` from `lucide-react`; toast `Deleted "<name>".`; failure "Couldn't delete the meeting. Try again."; restore failure "Couldn't restore the meeting. Try again." (unchanged).
- **Rank keys** come only from `src-tauri/src/rank.rs`. The frontend never makes a key. It sorts ranks with `<` and `>`, never with `localeCompare`.
- **Migrations:** the entries that are in `db.rs` today do not change. The new ones are added after them.
- **Documentation:** `docs/data-model.md` changes in the same task as the columns it describes. Docstrings use ASD-STE100 style and do not name sections of an ADR or a plan.
- Run `bun run fmt` after editing TypeScript and `bun run fmt:rust` after editing Rust. Run `bun run check` before each commit, and expect only the listed executable specs to fail until Task 5.

## Review Focus

1. **Old databases.** A user who updates has initiatives with positions, including completed and deleted ones, and meetings that refer to initiatives. After the update, each column must show the same order, the links from meetings must remain, and foreign keys must be enforced again. Task 5 has a migration test with such data.
2. **Many drops into the same gap.** Keys get longer, but the order must stay correct and no two keys may be equal. Task 3 has a test that drops into the same gap 200 times.
3. **Restoring when the rank is taken, with the holder last in its column.** There is no next rank, so the new key comes after the holder with no upper bound. Task 5 tests this.
4. **A stored rank that is not a valid key.** This could come from a manual edit or a future bug. A move next to it must fail with a message and must not panic. Task 3 tests invalid input, and Task 5 maps the error to a message.
5. **Clearing `deleted_at` while the rank collides.** The unique index would reject the update. The new rank must be computed first and written in the same statement. Task 5 tests a restore into a taken rank.

---

### Task 1: Rename `archived_at` to `deleted_at` in every layer

The user sees no change in this task. The meeting toast still says "Archived" until Task 2.

**Files:**
- Modify: `src-tauri/src/db.rs` (add a migration, and a test)
- Modify: `src-tauri/src/meetings.rs`, `src-tauri/src/initiatives.rs`, `src-tauri/src/tasks.rs` (tests only), `src-tauri/src/lib.rs`
- Modify: `src/lib/meetings.ts`, `src/lib/initiatives.ts`, and their tests
- Rename: `src/components/archive-provider.tsx` → `src/components/delete-provider.tsx`, `src/components/archive-provider.test.tsx` → `src/components/delete-provider.test.tsx`, `src/components/use-archive.ts` → `src/components/use-delete.ts`
- Modify every other file that `grep -rli archiv src src-tauri/src` lists, except the executable specs above
- Modify: `docs/data-model.md`

**Interfaces:**
- Produces, Rust: `meetings::delete(&Connection, id: i64) -> Result<(), Error>`, `meetings::restore(&Connection, id: i64) -> Result<(), Error>`, `initiatives::delete(&Connection, id: i64) -> Result<(), Error>`, `initiatives::restore(&Connection, id: i64) -> Result<RestoreOutcome, Error>`, `initiatives::list(&Connection, include_deleted: bool)`, `initiatives::Error::Deleted(i64)` (was `Archived`), fields `Initiative::deleted_at` and `InitiativeSummary::deleted_at`.
- Produces, TypeScript: `deleteMeeting(id)`, `restoreMeeting(id)` in `src/lib/meetings.ts`; `deleteInitiative(id)`, `restoreInitiative(id)`, `listInitiatives({ includeDeleted })`, and `deletedAt` in `src/lib/initiatives.ts`; `DeleteProvider` in `delete-provider.tsx`; in `use-delete.ts`: `DeleteKind`, `ItemToDelete`, `RestoredItem`, `DeleteApi = { deleteItem, version, restored }`, `DeleteContext`, `useDelete()`. In the provider, the per-kind actions are `{ remove, restore, deletedText, displayName }`.

- [ ] **Step 1: Write the failing migration test** in `db.rs`:

```rust
#[test]
fn deleted_at_replaces_archived_at() {
    let connection = open_in_memory();
    for table in ["meetings", "initiatives"] {
        let columns: Vec<String> = connection
            .prepare(&format!("SELECT name FROM pragma_table_info('{table}')"))
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert!(columns.contains(&"deleted_at".to_owned()), "{table}");
        assert!(!columns.contains(&"archived_at".to_owned()), "{table}");
    }
    let index: String = connection
        .query_row("SELECT sql FROM sqlite_master WHERE name = 'initiatives_name'", [], |row| row.get(0))
        .unwrap();
    assert!(index.contains("deleted_at IS NULL"));
}
```

- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml deleted_at_replaces_archived_at`. Expected: FAIL on the `deleted_at` assertion for `meetings`.

- [ ] **Step 3: Add the migration** at the end of `MIGRATIONS`:

```sql
ALTER TABLE meetings RENAME COLUMN archived_at TO deleted_at;
ALTER TABLE initiatives RENAME COLUMN archived_at TO deleted_at;
```

- [ ] **Step 4: Rename the Rust code.** In `meetings.rs` and `initiatives.rs`, use `deleted_at` in all SQL. Rename `archive` → `delete`, `unarchive` → `restore`, `include_archived` → `include_deleted`, `Error::Archived` → `Error::Deleted`, and the struct fields. Rename the tests that say archive, such as `archive_twice_keeps_the_first_time` → `delete_twice_keeps_the_first_time`, and update their docstrings. In `lib.rs`, rename the four command functions and their entries in `generate_handler!`, and the argument of `list_initiatives`. Run `cargo test --manifest-path src-tauri/Cargo.toml` and `bun run lint:rust`. Expected: PASS.

- [ ] **Step 5: Rename the frontend.** Apply the TypeScript names in the Interfaces block. Use `git mv` for the three component files. Change every import and every call site (`App.tsx`, `initiatives-page.tsx`, `initiative-form.tsx`, `meeting-editor.tsx`, `meetings-page.tsx`, `meeting-initiative-select.tsx`, `meeting-details-sidebar.tsx`, `toaster.tsx`), and the unit tests that mock the old command names or read `archivedAt`. Rename local names that say archive, such as `archiveButtonRefs` → `deleteButtonRefs`, `pendingArchiveIds` → `pendingDeleteIds`, `ArchivedNeighbors` → `DeletedNeighbors`, and `archiveCount` → `deleteCount`. Comments say "delete toast". Keep the meeting kind's `deletedText` returning `Archived "<name>".`, and keep the words on the meetings page, for Task 2. Keep the unit test assertions on those words as they are.

- [ ] **Step 6: Update `docs/data-model.md`.** Rename both `archived_at` rows of the diagram to `deleted_at`, with "Null until the meeting is deleted" and "Null until the initiative is deleted". Rewrite the two column descriptions, and the condition of `initiatives_name`, with `deleted_at` and the word "delete". Refer to ADR 0017 for the name.

- [ ] **Step 7: Verify.** Run `bun run fmt && bun run fmt:rust && bun run check`. Expected: only executable specs fail. `grep -rli archiv src src-tauri/src` lists only `delete.spec.tsx` and `delete.browser.spec.tsx` (the path of Spec 0004 in their header comment), and meeting code that shows the words "Archive" or "Archived".

- [ ] **Step 8: Commit and push.** Message: "Rename archived_at to deleted_at in every layer".

### Task 2: Say "Delete" for meetings

**Files:**
- Modify: `src/features/meetings/meetings-page.tsx`, `src/features/meetings/meeting-editor.tsx`, `src/components/delete-provider.tsx`
- Test: `src/features/meetings/meetings-page.test.tsx`, `src/features/meetings/meeting-editor-page.test.tsx`, `src/components/delete-provider.test.tsx`, `src/App.test.tsx`, `src/components/failure-toast-provider.test.tsx`, `src/components/failure-toast-provider.browser.test.tsx`

**Interfaces:**
- Consumes: `DeleteProvider` and `useDelete` from Task 1.

- [ ] **Step 1: Change the unit test assertions** to the exact copy in the Global Constraints: `Delete "<name>"`, "Delete", `Deleted "<name>".`, and "Couldn't delete the meeting. Try again." Change the test names that say archive.

- [ ] **Step 2:** Run `bunx vitest run --project unit src/features/meetings src/components src/App.test.tsx`. Expected: the changed unit tests FAIL because they find the old words.

- [ ] **Step 3: Change the words.** In `meetings-page.tsx`, use `aria-label={`Delete "${displayName(meeting.name)}"`}` and `Trash2Icon`. In `meeting-editor.tsx`, the button text is "Delete" with `Trash2Icon`, and the state `archiving` becomes `deleting`. In both, the failure is "Couldn't delete the meeting. Try again." In `delete-provider.tsx`, the meeting kind's `deletedText` returns `Deleted "<name>".`

- [ ] **Step 4: Verify.** Run `bun run fmt && bun run check`. Expected: `delete.spec.tsx`, `delete.browser.spec.tsx`, `action-items.spec.tsx`, and `action-items.browser.spec.tsx` now PASS. Only the initiative specs fail. `grep -rn '"Archive\|Archived \|archive the' src --include='*.tsx'` finds nothing outside the header comments of the specs.

- [ ] **Step 5: Commit and push.** Message: "Say Delete for meetings".

### Task 3: Make rank keys in one module

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `fractional_index = { version = "2", default-features = false }`)
- Create: `src-tauri/src/rank.rs`, with its tests
- Modify: `src-tauri/src/lib.rs` (add `mod rank;`)

**Interfaces:**
- Produces: `rank::between(before: Option<&str>, after: Option<&str>) -> Result<String, rank::Error>`, which returns a key that sorts after `before` and before `after`, as text compared byte by byte. `None` means no bound. `rank::Error` has two variants, `Invalid(String)`, for a key that `FractionalIndex::from_string` refuses, and `OutOfOrder { before: String, after: String }`, for bounds that are equal or reversed. It implements `Display` and `std::error::Error`. Use `FractionalIndex::new(lower, upper)` and `to_string()`. `between(None, None)` returns `FractionalIndex::default().to_string()`.

- [ ] **Step 1: Write the failing tests** in `rank.rs`:
  - `between_without_bounds_gives_a_key`: the result is not empty and contains only `0-9a-f`.
  - `between_respects_each_bound`: for `k = between(None, None)`, check `between(Some(&k), None) > k`, `between(None, Some(&k)) < k`, and for `a < b` two such keys, `a < between(Some(&a), Some(&b)) < b`, all compared as `String`.
  - `appending_200_keys_keeps_them_in_order`: each key comes from `between(Some(&last), None)`, and the keys are strictly increasing.
  - `dropping_200_times_into_one_gap_keeps_order_and_no_repeats`: start with `a` and `b`. Take `c = between(Some(&a), Some(&b))`, then set `b = c`, 200 times. Each `c` is strictly between the bounds at that time.
  - `invalid_keys_and_bounds_out_of_order_are_errors`: `between(Some("xyz"), None)` is `Err(Error::Invalid(_))`. `between(Some(&k), Some(&k))` and reversed bounds are `Err(Error::OutOfOrder { .. })`. The `Display` text names the key.

- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml rank::`. Expected: FAIL to compile, because `between` does not exist.

- [ ] **Step 3: Implement `rank::between`** as the Interfaces block says. Give the module a docstring that says it is the only place that makes keys, and that keys are lowercase hexadecimal text that sorts byte by byte. Until Task 5 uses it outside tests, `between` needs `#[cfg_attr(not(test), expect(dead_code, reason = "initiatives use it from the rank task on"))]`. A plain `expect` would be unfulfilled in the test build, which `cargo clippy --all-targets -- -D warnings` rejects. Task 5 removes it.

- [ ] **Step 4: Verify.** Run `cargo test --manifest-path src-tauri/Cargo.toml rank:: && bun run lint:rust`. Expected: PASS.

- [ ] **Step 5: Commit and push.** Message: "Add rank keys from fractional_index".

### Task 4: Apply migrations with foreign keys off

**Files:**
- Modify: `src-tauri/src/db.rs`

**Interfaces:**
- Produces: `fn migrations() -> Migrations<'static>` replaces the constant `MIGRATIONS`, because `M::up_with_hook` is not a `const fn`. The entries and their order stay as they are. `prepare(connection)` runs `PRAGMA foreign_keys = OFF`, then the migrations, then `PRAGMA foreign_keys = ON`. A private function `apply(connection: &mut Connection, migrations: &Migrations) -> Result<(), rusqlite_migration::Error>` holds these three steps, so that tests can pass their own migrations. Task 5 adds its migrations to `migrations()` and ends a rebuild with `.foreign_key_check()`.

- [ ] **Step 1: Write the failing tests** in `db.rs`:
  - `foreign_keys_are_on_after_open`: `PRAGMA foreign_keys` reads 1 on `open_in_memory()`.
  - `a_migration_can_rebuild_a_table_that_others_refer_to`: `apply` with a list of migrations. The first creates `parent(id)` and `child(parent_id REFERENCES parent(id))` and inserts a child that refers to parent 1. The second rebuilds `parent` (create `parent_new`, copy, drop `parent`, rename) and has `.foreign_key_check()`. The result is `Ok`, the child still refers to parent 1, and an insert of a child with `parent_id` 99 then fails.
  - `a_migration_that_breaks_a_reference_fails`: the same, but the rebuild copies no rows. The result is `Err`.

- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml db::`. Expected: FAIL to compile, because `apply` does not exist.

- [ ] **Step 3: Implement** `migrations()`, `apply`, and the new `prepare`. Update the docstring of `prepare` to say why foreign keys are off during migrations, and that each rebuild must check them itself. `migrations_are_valid` uses `migrations()`.

- [ ] **Step 4: Verify.** Run `cargo test --manifest-path src-tauri/Cargo.toml && bun run lint:rust`. Expected: PASS.

- [ ] **Step 5: Commit and push.** Message: "Apply migrations with foreign keys off and check them".

### Task 5: Order initiatives by rank

**Files:**
- Modify: `src-tauri/src/db.rs` (two migrations, a hook, a test)
- Modify: `src-tauri/src/initiatives.rs`, `src-tauri/src/rank.rs` (remove the `expect`)
- Modify: `src/lib/initiatives.ts`, `src/lib/initiatives.test.ts`, `src/features/initiatives/board.ts`, `src/features/initiatives/board.test.ts`, `src/features/initiatives/initiative-form.test.tsx`, and every other fixture that sets `position:`
- Modify: `docs/data-model.md`

**Interfaces:**
- Consumes: `rank::between` (Task 3), `migrations()` and `.foreign_key_check()` (Task 4).
- Produces, Rust: `Initiative::rank: String` and `InitiativeSummary::rank: String` replace `position`. `initiatives::Error::Rank(rank::Error)` has the message `invalid rank: <inner message>`. `list` orders by `horizon, rank, id`.
- Produces, TypeScript: `rank: string` on `Initiative` and `InitiativeSummary` in place of `position`; `compareRanks(a: string, b: string): number` in `src/lib/initiatives.ts`, which returns -1, 0, or 1 by comparing with `<` and `>`.

- [ ] **Step 1: Write the failing migration test** in `db.rs`, `migration_keeps_the_order_of_every_column_and_the_links_of_meetings`:
  - Use `Migrations::to_version` to migrate a connection up to the version before the new rank migrations. At that version, the table has `position` and `deleted_at`.
  - Insert these rows:
    - `later`: B at position 0, A at position 1, and C at position 1 with a larger id, which is a tie.
    - `now`: a completed initiative at position 0 and a deleted initiative at position 0.
    - A meeting whose `initiative_id` refers to A.
  - Migrate to the latest version with `apply`.
  - Check that the names in `later`, ordered by `rank`, are `["B", "A", "C"]`, and that every rank is unique in its horizon.
  - Check that `pragma_table_info('initiatives')` has `rank` and no `position`, that the meeting still refers to A, and that `PRAGMA foreign_keys` is 1.
  - Check that an `UPDATE` that gives C the rank of B fails.

- [ ] **Step 2: Write the failing backend tests** in `initiatives.rs`. Replace the helper `column` with one that returns `(name, rank)` ordered by `rank`, and make `names` use it. Remove `assert_dense`. Rewrite each test that asserted positions so that it asserts the order of names. Add these tests:
  - `a_move_changes_only_the_moved_initiative`: read `(id, rank, horizon, completed_at, deleted_at)` of all rows, move one initiative, and read them again. Only the moved row differs.
  - `complete_and_delete_keep_the_rank`: `rank` is equal before and after `move_to(DONE)` and before and after `delete`.
  - `the_database_refuses_two_initiatives_with_one_rank_on_the_board`: an `UPDATE` that copies a rank within a horizon on the board fails. The same rank on a completed initiative is accepted.
  - `restore_keeps_a_free_rank`: delete B from `[A, B, C]` and restore it. The result is `[A, B, C]` and the same rank.
  - `restore_into_a_taken_rank_goes_directly_after_the_holder`: delete B from `[A, B, C]`, set the rank of C to the rank of B with SQL, and restore B. The result is `[A, C, B]`.
  - `restore_into_a_taken_rank_of_the_last_card`: the same with `[A, B]`, where A takes the rank of B. The result is `[A, B]`.
  - `reopen_goes_to_the_drop_index`: complete B from `[A, B, C]`, then `move_to(B, "later", 0)`. The result is `[B, A, C]`.
  - `a_move_next_to_an_invalid_rank_fails_with_a_message`: set a rank to `'zz'` with SQL. A move next to it returns `Err(Error::Rank(_))`, whose text starts with `invalid rank`.

- [ ] **Step 3:** Run `cargo test --manifest-path src-tauri/Cargo.toml`. Expected: FAIL to compile, or FAIL on the new tests.

- [ ] **Step 4: Add the two migrations** after the one from Task 1:
  - First: `M::up_with_hook("ALTER TABLE initiatives ADD COLUMN rank TEXT;", fill_ranks)`. The function `fill_ranks(transaction: &Transaction) -> HookResult` walks each horizon in `ORDER BY position, id` over all rows and gives each row `rank::between(previous, None)`. It maps `rank::Error` to `HookError::Hook(error.to_string())`.
  - Second: `M::up(REBUILD_INITIATIVES).foreign_key_check()`.
    - `REBUILD_INITIATIVES` creates `initiatives_new` with the columns and `CHECK` constraints of today, `rank TEXT NOT NULL` in place of `position`, and `deleted_at`.
    - It copies every row, drops `initiatives`, and renames `initiatives_new` to `initiatives`.
    - It creates `initiatives_name ON initiatives(name COLLATE NOCASE) WHERE deleted_at IS NULL AND name <> ''` and `initiatives_horizon_rank ON initiatives(horizon, rank) WHERE completed_at IS NULL AND deleted_at IS NULL`, both `UNIQUE`.

- [ ] **Step 5: Change `initiatives.rs`.** The module docstring states the rank rule instead of the position rule. Remove `close_gap` and `open_gap`. The functions work as follows:
  - `create` takes `rank::between(None, first)`, where `first` is the smallest rank on the board in `later`.
  - `move_to` with a horizon calls `place`. `place` reads the ranks on the board in the destination, without the initiative, in rank order. It clamps the index, takes the ranks at `index - 1` and `index` as the bounds, and writes `horizon`, `rank`, and `completed_at = NULL` in one `UPDATE`.
  - `move_to(DONE)` and `delete` write only their timestamp.
  - `restore` of an initiative that is not completed first looks for another initiative on the board in its horizon with the same rank. If it finds one, the new rank is `rank::between(Some(held), next)`, where `next` is the smallest rank on the board in that horizon that is greater than the held rank, or `None`. Then one `UPDATE` sets `deleted_at = NULL` and the rank.

  Update the docstrings of `create`, `move_to`, `delete`, `restore`, and the struct fields. Remove the `cfg_attr` from `rank.rs`.

- [ ] **Step 6:** Run `cargo test --manifest-path src-tauri/Cargo.toml && bun run lint:rust`. Expected: PASS.

- [ ] **Step 7: Write the failing frontend tests.**
  - In `src/lib/initiatives.test.ts`, add `compareRanks sorts by character codes, not by language rules`: `compareRanks("81f", "c") < 0`, `compareRanks("B", "a") < 0` (`localeCompare` gives the opposite), and `compareRanks("8", "8") === 0`.
  - Change all fixtures from `position: n` to `rank`, with values whose text order is the intended order, such as `"8"`, `"81"`, `"c"`.
  - Add a case to `initiativeChoiceGroups` and one to `buildBoard` where identifier order and rank order differ.

- [ ] **Step 8:** Run `bunx vitest run --project unit src/lib src/features/initiatives`. Expected: FAIL.

- [ ] **Step 9: Change the frontend.** Add `compareRanks`. Replace `position` with `rank` in the types, with a docstring that says the frontend compares ranks only with `compareRanks`. `buildBoard` sorts Now, Next, and Later with `compareRanks(a.rank, b.rank) || a.id - b.id`, and so does `initiativeChoiceGroups`. Update the docstrings that say "position" for the order of cards. The text "position <n> of <count>" in `announcements.ts` is copy for screen readers and stays.

- [ ] **Step 10: Update `docs/data-model.md`.**
  - Replace the `position` row with `TEXT rank "Not null. Lexical key. Unique within the horizon among initiatives on the board"`.
  - Rewrite the description of `position` for `rank`: the key, the rule, the unique index `initiatives_horizon_rank`, that a completed or deleted initiative keeps its rank, and what a restore does when the rank is taken. Refer to ADR 0017.
  - Remove the text about renumbering and about the index on `(horizon, position)`.

- [ ] **Step 11: Verify.** Run `bun run fmt && bun run fmt:rust && bun run check`. Expected: PASS, with every executable spec passing. `grep -rn "position" src-tauri/src src/lib src/features/initiatives/board.ts` finds nothing that means the order of cards.

- [ ] **Step 12: Commit and push.** Message: "Order initiatives by rank".

### Task 6: Verify the whole branch and open the PR

- [ ] **Step 1:** Run `bun run check`. Expected: PASS.
- [ ] **Step 2:** Update the description of PR #17. It has a summary, the parts of ADRs 0008 and 0013 that ADR 0017 supersedes, and these checks for a human with `bun run tauri dev`:
  1. Before switching to this branch, back up the existing `gps.sqlite` from the application data directory, and note the order of every roadmap column on `main`.
  2. On this branch, check that every column shows the same order, and that meetings keep their initiatives.
  3. Drag a card, delete it, and click Undo.
  4. Check that the Meetings page says "Delete".
- [ ] **Step 3:** Mark the PR ready for review with `gh pr ready 17`, and report to the human that the checks by hand are waiting.
