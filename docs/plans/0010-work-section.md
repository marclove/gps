# The Work Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Work section, where every task waits in the Icebox, is prioritized into one ordered list shown as Current and Backlog, and is completed into Done. Tasks get a description, a project, and an initiative, which the user edits in a task sheet that the Work page, meetings, the project page, and the initiative sheet can open.

**Architecture:** The work goes in eight vertical slices. Each slice leaves the application working.

1. The first three slices change the backend and `src/lib/tasks.ts`. Slice 1 rebuilds the table `tasks` and gives action items their defaults. Slice 2 adds the commands that move a task between stages. Slice 3 adds the commands that change the project and the initiative of a task, and the rules that other tables keep for tasks.
2. Slice 4 moves the generic parts of the roadmap board to `src/components/board/`, with no change in behavior.
3. Slices 5 to 8 build the user interface: the Work page and its board, the task sheet, the changes to action items, and the lists on the project page and in the initiative sheet.

**Tech Stack:** Rust with `rusqlite` and `rusqlite_migration`; React 19 with TypeScript; dnd-kit; Base UI sheets from shadcn; TipTap through the shared `MarkdownEditor`; Vitest with React Testing Library in jsdom, and the `browser` project in headless WebKit.

**Spec:** `docs/specs/0010-work-section.md`, argued in `docs/adrs/0023-store-the-stage-of-a-task-in-its-columns.md`, `docs/adrs/0024-share-one-board-between-the-roadmap-and-the-work-section.md`, and `docs/adrs/0025-edit-tasks-in-a-sheet-that-any-page-can-open.md`. Read all four before you start a task. The ADRs hold the exact rules that this plan does not repeat.

The executable specs and their shared fake backend are already written. Do not change them to make them pass:

- `src/features/work/work.spec.tsx`
- `src/features/work/task-sheet.spec.tsx`
- `src/features/work/work.browser.spec.tsx`
- `src/features/tasks/action-items-work.spec.tsx`
- `src/features/tasks/action-items.spec.tsx`
- `src/features/tasks/action-items.browser.spec.tsx`
- `src/features/projects/project-tasks.spec.tsx`
- `src/test/fake-backend.ts` and `src/test/fake-backend.test.ts`

If one of them seems wrong, stop and ask a human. These specs pass only when the task that owns their behavior is done, and all of them pass after Task 8. Every other test, and `bun run typecheck`, `bun run lint`, `bun run fmt:check`, `bun run lint:rust`, `bun run fmt:rust:check`, and `bun run test:rust`, must pass after every task. At the end of each task, list which spec files pass now, and which still fail and why.

## Global Constraints

- **Commands and results** are exactly as in "Backend contract" of the spec and the command table of ADR 0023. Arguments and fields are camelCase on the frontend and snake_case in Rust, with `#[serde(rename_all = "camelCase")]`. `move_task` takes `destination` as the text `"current"`, `"backlog"`, `"icebox"`, or `"done"`.
- **The stage of a task** follows only from `rank`, `started_at`, `completed_at`, and `deleted_at`, as in the table of ADR 0023. There is no stage column. The board's column order, from left to right, is Current, Backlog, Icebox, Done.
- **Ranks** are made only by `rank::between` in Rust. The frontend never makes a key; it sorts by comparing ranks as text, with `compareRanks` in `src/lib/initiatives.ts` (move it to a shared place if a second feature needs it; do not copy it).
- **`updated_at`** of a task changes only when the title, the description, the project, or the initiative changes. Moving, starting, completing, reopening, deleting, and restoring leave it alone.
- **Exact copy** (from the spec; do not reword):
  - Section and page: "Work", "New task", "Current", "Backlog", "Icebox", "Done", "Add task", "No tasks", "Couldn't load tasks", "Retry", "Untitled task", "Untitled project".
  - Buttons: `Start "<shown title>"`, `Reopen "<shown title>"`, `Open "<text>"`.
  - Sheet: "Task title", "Project", "No project", "Initiative", "No initiative", "Meeting", " (deleted)", `Completed on <date>`, "Description", "Delete", "Save", "Close", "Couldn't load the task".
  - Failure toasts: "Couldn't add the task. Try again.", "Couldn't move the task. Try again.", "Couldn't start the task. Try again.", "Couldn't reopen the task. Try again.", "Couldn't change the project. Try again.", "Couldn't change the initiative. Try again.", "Couldn't delete the task. Try again.", "Couldn't restore the task. Try again.", `Couldn't delete "<name>" because it still has tasks.`
  - Announcements: `Picked up <t>.`, `<t> is in <column>, position <n> of <count>.`, `<t> was moved to <column>, position <n> of <count>.`, `<t> was moved to Icebox.`, `<t> was completed.`, `<t> was put back.`
- **Sorting of choices** in the sheet's select boxes: by shown name with the existing `byLabel` in `src/lib/initiatives.ts`, with "No project" or "No initiative" first.
- **Migrations:** the entries in `MIGRATIONS` in `db.rs` do not change. The new one goes after them and ends with `.foreign_key_check()`. `docs/data-model.md` changes in the same commit as the migration.
- Public Rust items and exported TypeScript items get docstrings in ASD-STE100 style. Comments do not name sections of ADRs or plans.
- Every new backend command is added to `generate_handler!` in `lib.rs`, has `#[expect(clippy::needless_pass_by_value)]`, and is a thin call of `database.run` with one function of `tasks.rs`.

## Review Focus

1. **A move in Current or the Backlog when the two columns interleave in the list.** For example, the list is A (started), B, C (started), D. Dropping D in Current between A and C must put it directly after A in the list, before B, and must not reorder B. Task 2 tests this in `tasks.rs` (`move_to_current_goes_directly_after_the_card_above_in_the_whole_list`).
2. **A new key that equals the held rank of a completed or deleted task.** The unique index leaves those tasks out, so the key is allowed. Reopening or restoring the old task must then put it directly after the task that holds its rank, not fail on the index. Task 2 tests this in `tasks.rs` (`reopen_after_the_task_that_took_the_rank`, `restore_after_the_task_that_took_the_rank`).
3. **Several quick drops or starts, one of which fails.** The user expects the failure toast, and the board to show the saved state once no other move is waiting, not a reload in the middle of a drag. Task 5 tests this in `work-page.test.tsx` (`reloads once after a failed move when no other move is waiting`).
4. **An action item whose text changed and was not saved yet when the user clicks Open or the remove button.** Open must save the text first, so the sheet shows it. Remove must drop the waiting change, as Spec 0005 says, and Undo must bring back the saved title. Task 7 tests both in `action-items-panel.test.tsx`.
5. **The migration of tasks whose meeting has a deleted project, a deleted initiative, or several initiatives, and tasks without a meeting.** Task 1 tests each case in `db.rs`.

---

### Task 1: Rebuild `tasks` and give action items their defaults

After this task, the database has the new columns, action items are created with `create_meeting_task` and get the project and initiative of their meeting, deleted tasks are hidden from a meeting, and the frontend knows the new `Task` shape. Nothing new is visible yet.

**Files:**
- Modify: `src-tauri/src/db.rs` (migration 12 `REBUILD_TASKS` and its tests)
- Modify: `src-tauri/src/tasks.rs` (`Task`, `Error`, `list`, `get`, `list_for_meeting`, `create_for_meeting`, and their tests; remove `create`)
- Modify: `src-tauri/src/lib.rs` (commands `list_tasks`, `get_task`, `create_meeting_task`; remove `create_task`, which Task 3 adds back with a new shape)
- Modify: `src/lib/tasks.ts` (`Task`, `TaskStage`, `stageOf`, `taskTitle`, `listTasks`, `getTask`, `createMeetingTask`; remove `createTask`)
- Modify: `src/features/tasks/action-items-panel.tsx` (call `createMeetingTask`)
- Modify: test fixtures that build a `Task` (`grep -rn "completedAt" src --include=*.test.tsx`), except the files that must not change
- Modify: `docs/data-model.md` (the table `tasks`: new columns, the check, the indexes, and the relationships to `projects` and `initiatives`)

**Interfaces:**
- Produces (Rust, `tasks.rs`):
  - `pub struct Task { id: i64, meeting_id: Option<i64>, title: String, description: String, project_id: Option<i64>, initiative_id: Option<i64>, rank: Option<String>, created_at: String, updated_at: String, started_at: Option<String>, completed_at: Option<String>, deleted_at: Option<String> }`
  - `pub enum Error { NotFound(i64), MeetingNotFound(i64), ProjectNotFound(i64), ProjectDeleted(i64), InitiativeNotFound(i64), InitiativeDeleted(i64), Deleted(i64), Completed(i64), NotInBacklog(i64), Empty, Rank(rank::Error), Database(rusqlite::Error) }`. Tasks 2 and 3 use the variants that this task does not.
  - `pub fn list(connection: &Connection) -> Result<Vec<Task>, Error>`: tasks that are not deleted, in any order.
  - `pub fn get(connection: &Connection, id: i64) -> Result<Option<Task>, Error>`: also a deleted task.
  - `pub fn list_for_meeting(connection: &Connection, meeting_id: i64) -> Result<Vec<Task>, Error>`: not deleted, by `created_at, id`.
  - `pub fn create_for_meeting(connection: &Connection, meeting_id: i64, title: &str) -> Result<Task, Error>`
  - a private `const COLUMNS: &str` with the select list, and `task_from_row`, which every query of the module uses.
- Produces (TypeScript, `src/lib/tasks.ts`):
  - `type Task` with the twelve fields of the contract.
  - `type TaskStage = "current" | "backlog" | "icebox" | "done"` and `stageOf(task: Task): TaskStage` (for a task that is not deleted).
  - `taskTitle(task: { title: string }): string`, which returns "Untitled task" for an empty title. `actionItemName` stays.
  - `listTasks(): Promise<Task[]>`, `getTask(id: number): Promise<Task | null>`, `createMeetingTask(meetingId: number, title: string): Promise<Task>`.

- [ ] **Step 1: Write the failing migration tests in `db.rs`**

  Follow the existing tests that migrate to an older version and seed rows with SQL (`const VERSION_WITHOUT_TASK_STAGES: usize = 11`). Tests:
  - `task_stages_migration_keeps_title_meeting_and_completion`: an open task and a completed task keep `title`, `meeting_id`, `created_at`, `updated_at`, and `completed_at`; both have empty `description`, and null `rank`, `started_at`, and `deleted_at`.
  - `task_stages_migration_gives_the_project_of_the_meeting`: also for a deleted meeting.
  - `task_stages_migration_skips_a_deleted_project`: `project_id` is null.
  - `task_stages_migration_gives_the_only_initiative_that_is_not_deleted`: a meeting that covers one live initiative and one deleted initiative gives the live one; a meeting that covers two live initiatives gives none.
  - `task_stages_migration_refuses_a_started_task_without_rank`: after the migration, an `UPDATE` that sets `started_at` on a task with a null rank fails.
  - `task_stages_migration_refuses_two_prioritized_tasks_with_one_rank`, and allows it when one of them is completed or deleted.

- [ ] **Step 2: Run them to see them fail**

  Run: `cargo test --manifest-path src-tauri/Cargo.toml task_stages_migration`
  Expected: FAIL, the columns do not exist.

- [ ] **Step 3: Add migration 12 `REBUILD_TASKS` to `db.rs`**

  Create `tasks_new` with the columns in the order of ADR 0023, foreign keys to `meetings`, `projects`, and `initiatives`, and `CHECK (started_at IS NULL OR rank IS NOT NULL)`. Copy every row with the same `id`, with the project and initiative computed as the ADR says (one `INSERT ... SELECT` with subqueries). Drop `tasks`, rename, and create `tasks_meeting_id`, `tasks_project_id`, `tasks_initiative_id`, and the partial unique index `tasks_rank` on `rank` `WHERE rank IS NOT NULL AND completed_at IS NULL AND deleted_at IS NULL`. Register it as `M::up(REBUILD_TASKS).foreign_key_check()`.

- [ ] **Step 4: Run the migration tests to see them pass**

  Run: `cargo test --manifest-path src-tauri/Cargo.toml task_stages_migration`
  Expected: PASS.

- [ ] **Step 5: Write the failing tests in `tasks.rs`**

  - `list_leaves_out_deleted_tasks` and `get_returns_a_deleted_task` (set `deleted_at` with SQL; `delete` changes in Task 2).
  - `list_for_meeting_leaves_out_deleted_tasks`.
  - `create_for_meeting_puts_the_task_in_the_icebox`: `rank` and `started_at` are `None`.
  - `create_for_meeting_gives_the_project_of_the_meeting`, `create_for_meeting_skips_a_deleted_project`, `create_for_meeting_gives_the_only_initiative_that_is_not_deleted`, `create_for_meeting_gives_no_initiative_for_two_initiatives`.
  - `create_for_meeting_refuses_a_missing_meeting` (`Error::MeetingNotFound`).
  - Adapt the existing tests of `create` to `create_for_meeting`.

- [ ] **Step 6: Run them to see them fail**, then implement `Task`, `Error`, `list`, `get`, `list_for_meeting`, and `create_for_meeting`, and run `cargo test --manifest-path src-tauri/Cargo.toml tasks::` until they pass.

- [ ] **Step 7: Register the commands in `lib.rs`**, update `src/lib/tasks.ts`, switch the action items panel to `createMeetingTask`, update test fixtures, and update `docs/data-model.md`.

- [ ] **Step 8: Verify**

  Run: `bun run check`
  Expected: every check passes except the executable specs listed above. In `action-items.spec.tsx`, the tests that add an item now pass; the ones about "Open" and the delete toast still fail.

- [ ] **Step 9: Commit and push**

---

### Task 2: Move tasks between stages

After this task, the backend can move, start, complete, reopen, delete, and restore tasks by the rules of ADR 0023. The frontend has functions for each. Removing an action item keeps the row, but the user sees no change yet.

**Files:**
- Modify: `src-tauri/src/tasks.rs`
- Modify: `src-tauri/src/lib.rs` (commands `move_task`, `start_task`, `restore_task`; `set_task_completed` and `delete_task` keep their signatures)
- Modify: `src/lib/tasks.ts`

**Interfaces:**
- Consumes: `Task`, `Error`, `COLUMNS` from Task 1; `rank::between(before: Option<&str>, after: Option<&str>) -> Result<String, rank::Error>`.
- Produces (Rust):
  - `#[derive(Deserialize)] #[serde(rename_all = "lowercase")] pub enum Destination { Current, Backlog, Icebox, Done }`
  - `pub fn move_to(connection: &Connection, id: i64, destination: Destination, index: i64) -> Result<Task, Error>`
  - `pub fn start(connection: &Connection, id: i64) -> Result<Task, Error>`
  - `pub fn set_completed(connection: &Connection, id: i64, completed: bool) -> Result<Task, Error>`
  - `pub fn delete(connection: &Connection, id: i64) -> Result<(), Error>`
  - `pub fn restore(connection: &Connection, id: i64) -> Result<Task, Error>`
  - private `fn list_ranks(connection: &Connection, except: i64) -> Result<Vec<(String, bool)>, Error>`: the rank and "is started" of every prioritized task that is not completed and not deleted, without `except`, in rank order.
  - private `fn return_to_held_place(connection: &Connection, id: i64) -> Result<(), Error>`: gives a task whose rank is held by a prioritized task a key between that rank and the next greater rank in the list. `set_completed(false)` and `restore` call it after they clear their column.
- Produces (TypeScript): `moveTask(id: number, destination: TaskStage, index: number): Promise<Task>`, `startTask(id: number): Promise<Task>`, `restoreTask(id: number): Promise<Task>`. `setTaskCompleted` and `deleteTask` keep their signatures.

The placement algorithm of `move_to` for Current and the Backlog, which the signature does not determine:

```text
list    = list_ranks(except = id)                 -- whole list, rank order
column  = positions in list whose started flag matches the destination
index   = clamp(index, 0, column.len())
if index > 0:  after  = list[column[index - 1]];  before-bound = after, after-bound = next item of list after it
elif column non-empty: before = list[column[0]];  after-bound = before, before-bound = previous item of list
else:          before-bound = last item of list, after-bound = None
rank = rank::between(before-bound, after-bound)
```

- [ ] **Step 1: Write the failing tests in `tasks.rs`**

  Use a helper that seeds tasks in a stage with SQL. Tests:
  - `move_to_backlog_prioritizes_an_icebox_task_at_the_index`
  - `move_to_current_starts_the_task_and_keeps_an_existing_start_time`
  - `move_to_backlog_clears_the_start`
  - `move_to_current_goes_directly_after_the_card_above_in_the_whole_list` (list A started, B, C started, D; move D to Current index 1; list becomes A, D, B, C)
  - `move_to_backlog_at_index_zero_goes_directly_before_the_first_backlog_card`
  - `move_to_an_empty_column_goes_to_the_end_of_the_list`
  - `move_to_icebox_clears_rank_and_start`
  - `move_to_done_completes_and_keeps_rank_and_start`
  - `move_to_refuses_a_completed_or_deleted_task`
  - `move_to_writes_only_the_moved_row` (the ranks of the others do not change)
  - `move_to_does_not_change_updated_at`
  - `start_keeps_the_rank` and `start_refuses_a_task_outside_the_backlog`
  - `set_completed_keeps_the_first_completion_time`
  - `reopen_returns_to_current_backlog_or_icebox` (one test per stage, or a table)
  - `reopen_after_the_task_that_took_the_rank`
  - `set_completed_refuses_a_deleted_task`
  - `delete_keeps_the_row_and_the_first_time`
  - `restore_returns_to_the_held_place` and `restore_after_the_task_that_took_the_rank`
  - `restore_of_a_completed_task_goes_to_done`

- [ ] **Step 2: Run them to see them fail**

  Run: `cargo test --manifest-path src-tauri/Cargo.toml tasks::`
  Expected: FAIL, the functions do not exist or `delete` removes the row.

- [ ] **Step 3: Implement the functions**, each in one transaction (`unchecked_transaction`, as `initiatives::set_project` does). Map `rank::Error` to `Error::Rank`.

- [ ] **Step 4: Run the Rust tests to see them pass.** Then register the commands and add the TypeScript functions.

- [ ] **Step 5: Verify**

  Run: `bun run check`
  Expected: every check passes except the executable specs.

- [ ] **Step 6: Commit and push**

---

### Task 3: Keep the project and the initiative of a task

After this task, tasks can be created with a project and an initiative and changed in both, moving an initiative moves its tasks, and a project with tasks cannot be deleted. The delete provider knows the kind `"task"` and the new refusal.

**Files:**
- Modify: `src-tauri/src/tasks.rs` (`create`, `update_title`, `update_description`, `set_project`, `set_initiative`)
- Modify: `src-tauri/src/initiatives.rs` (`set_project` moves tasks)
- Modify: `src-tauri/src/projects.rs` (`DeleteOutcome::HasTasks`)
- Modify: `src-tauri/src/lib.rs` (commands `create_task`, `update_task_description`, `set_task_project`, `set_task_initiative`)
- Modify: `src/lib/tasks.ts`, `src/lib/projects.ts` (`hasTasks` in the delete result)
- Modify: `src/components/delete-provider.tsx` (kind `"task"`; the `hasTasks` text for kind `"project"`) and its test

**Interfaces:**
- Produces (Rust, `tasks.rs`):
  - `pub fn create(connection: &Connection, title: &str, description: &str, project_id: Option<i64>, initiative_id: Option<i64>) -> Result<Task, Error>`. Trims the title. Refuses with `Error::Empty` when the trimmed title and the description are empty and both identifiers are `None`.
  - `pub fn update_title(connection: &Connection, id: i64, title: &str) -> Result<Task, Error>` (trims the title; changes `updated_at`)
  - `pub fn update_description(connection: &Connection, id: i64, description: &str) -> Result<Task, Error>`
  - `pub fn set_project(connection: &Connection, id: i64, project_id: Option<i64>) -> Result<Task, Error>`
  - `pub fn set_initiative(connection: &Connection, id: i64, initiative_id: Option<i64>) -> Result<Task, Error>`
- Produces (Rust, `projects.rs`): `DeleteOutcome::HasTasks`, serialized as `{ status: "hasTasks" }`.
- Produces (TypeScript): `createTask(fields: { title: string; description: string; projectId: number | null; initiativeId: number | null }): Promise<Task>`, `updateTaskDescription(id: number, description: string): Promise<Task>`, `setTaskProject(id: number, projectId: number | null): Promise<Task>`, `setTaskInitiative(id: number, initiativeId: number | null): Promise<Task>`. `updateTaskTitle` keeps its signature.
- Produces (delete provider): `deleteItem({ kind: "task", id, name })` deletes with `deleteTask` and restores with `restoreTask`; the name for an empty title is given by the caller.

- [ ] **Step 1: Write the failing Rust tests**

  In `tasks.rs`:
  - `create_trims_the_title_and_puts_the_task_in_the_icebox`
  - `create_with_an_initiative_takes_its_project` (passes another `project_id`; the initiative's project wins)
  - `create_refuses_a_deleted_project_or_initiative`
  - `create_refuses_an_empty_task`
  - `update_title_trims_and_changes_updated_at`
  - `set_initiative_sets_the_project`, `set_initiative_to_none_keeps_the_project`, `set_initiative_refuses_a_deleted_initiative`
  - `set_project_clears_an_initiative_of_another_project`, `set_project_keeps_an_initiative_of_that_project`, `set_project_to_none_clears_both`, `set_project_refuses_a_deleted_project`
  - `setting_the_same_project_or_initiative_changes_nothing` (also `updated_at`)
  - `a_task_keeps_a_project_or_initiative_deleted_later`

  In `initiatives.rs`: `set_project_moves_every_task_of_the_initiative` (open, completed, and deleted tasks; their `updated_at` changes).

  In `projects.rs`: `delete_refuses_a_project_with_tasks` (a completed task counts, a deleted task does not) and `delete_answers_has_initiatives_first`.

- [ ] **Step 2: Run them to see them fail**

  Run: `cargo test --manifest-path src-tauri/Cargo.toml`
  Expected: FAIL for the new tests only.

- [ ] **Step 3: Implement**, each command in one transaction.

- [ ] **Step 4: Run the Rust tests to see them pass**

- [ ] **Step 5: Write the failing test in `src/components/delete-provider.test.tsx`**

  - `deletes a task and restores it on Undo` (calls `delete_task`, then `restore_task`; the toast says `Deleted "Send the deck".`)
  - `says that a project still has tasks` (the rejection message is `Couldn't delete "Checkout" because it still has tasks.`)
  - `keeps Undo when a task cannot be restored` (the toast text becomes "Couldn't restore the task. Try again.")

- [ ] **Step 6: Implement** the commands, the TypeScript functions, and the delete provider changes. Run `bunx vitest run src/components/delete-provider.test.tsx` until it passes.

- [ ] **Step 7: Verify**

  Run: `bun run check`
  Expected: every check passes except the executable specs. In `project-tasks.spec.tsx`, the tests about deleting a project now pass.

- [ ] **Step 8: Commit and push**

---

### Task 4: Share the board between features

This is a refactor inside the feature: the roadmap behaves exactly as before. Commit the moves in small steps, each with all tests passing. Do not change any roadmap spec.

**Files:**
- Create: `src/components/board/board.tsx` (`Board`), `board-column.tsx` (`BoardColumn`), `board-card.tsx` (`BoardCard`, `BoardCardCopy`), `card-pointer-sensor.ts` (moved), `drop-target.ts` (`dropTarget`, `ListData`, `DropTarget`, from `announcements.ts`), `announcements.ts` (`boardAnnouncements`), `cards.ts` (`columnOf`, `moveCard`), and their tests (moved from `src/features/initiatives/`)
- Modify: `src/features/initiatives/roadmap-board.tsx` (becomes a thin use of `Board`), `initiative-card.tsx` (only the content and the overlay copy), `board.ts` (keeps `buildBoard`, `filterBoard`, `fullIndex`, `addCard`, `replaceCard`, `removeCard`), `initiatives-page.tsx` (`data-card-id`)
- Delete: `src/features/initiatives/roadmap-column.tsx`, `card-pointer-sensor.ts`, `announcements.ts` after their parts moved

**Interfaces:**
- Produces (`src/components/board/`):

  ```ts
  type BoardColumnDef = {
      id: string;
      title: string;
      /** The user sets the order of the cards. */
      ordered: boolean;
      /** Cards can be picked up. */
      draggable: boolean;
      emptyText: string;
      /** An element above the cards, such as a text field. */
      header?: ReactNode;
      /** For a column that is not ordered: the place of `card` among `others`. */
      sortedIndex?: (card: C, others: C[]) => number;
  };

  type BoardMessages<C> = {
      pickedUp: (card: C) => string;
      over: (card: C, column: BoardColumnDef, position: number, count: number) => string;
      dropped: (card: C, column: BoardColumnDef, position: number, count: number) => string;
      putBack: (card: C) => string;
  };

  function Board<C extends { id: number }>(props: {
      columns: BoardColumnDef[];
      cards: Record<string, C[]>;
      label: (card: C) => string;          // start of the open button's accessible name
      renderContent: (card: C, column: string) => ReactNode;
      renderCopy: (card: C) => ReactNode;  // the overlay copy
      renderActions?: (card: C, column: string) => ReactNode;
      messages: BoardMessages<C>;
      onOpen: (id: number) => void;
      onMove: (id: number, column: string, index: number) => void;
      loading: boolean;
  }): JSX.Element;
  ```

  `BoardColumnDef` is generic in `C` where `sortedIndex` needs it. The card container has `data-card-id`; the open button carries the dnd-kit listeners and is the activator node (ADR 0024). A card that drops in its own column when the column is not ordered is put back, with the `putBack` message.
- Consumes: the roadmap's `COLUMNS` and words become `BoardColumnDef`s and `BoardMessages` inside `roadmap-board.tsx`.

- [ ] **Step 1: Baseline.** Run `bun run check` and record that it passes except the executable specs of this feature.
- [ ] **Step 2: Move `CardPointerSensor`, `columnOf`, and `moveCard`** to `src/components/board/`, update imports, run `bun run check`, commit.
- [ ] **Step 3: Generalize `dropTarget` and the announcements** to take column definitions and `BoardMessages`, move them and their tests, run `bun run check`, commit. The existing assertions of `announcements.test.ts` stay; only the setup changes.
- [ ] **Step 4: Split the card** into `BoardCard` (container, open button, actions slot) and the initiative content. Run `bun run test` including the browser project: `roadmap.browser.spec.tsx`, `filtered-roadmap.browser.spec.tsx`, and `roadmap-board.browser.test.tsx` must pass unchanged, except the attribute `data-initiative-id` becomes `data-card-id` in a test that queries it. Commit.
- [ ] **Step 5: Move the board and the column** to `Board` and `BoardColumn`, with `sortedIndex` for Done returning 0. Run `bun run check` and the browser project. Commit.
- [ ] **Step 6: Write a failing test in `src/components/board/board.test.tsx`** for the two things the roadmap does not use: `does not pick up a card in a column that is not draggable` (Space on the open button of such a card announces nothing and calls no `onMove`), and `renders the actions of a card beside its open button` (the action button is not inside the open button). Implement until they pass. Commit and push.

---

### Task 5: The Work page and its board

After this task, the Work section shows the board, the Icebox field adds tasks, Start and Reopen work, and cards can be dragged. Clicking a card opens nothing yet; Task 6 adds the sheet.

**Files:**
- Create: `src/features/work/work-page.tsx` (`WorkPage`), `work-board.ts` (`WorkBoard` type and pure helpers), `task-card.tsx` (content, copy, and actions of a task card), `add-task-field.tsx`, and tests `work-board.test.ts`, `work-page.test.tsx`
- Modify: `src/App.tsx` (route `/work`), `src/components/app-sidebar.tsx` (`SECTIONS`: `{ title: "Work", path: "/work", icon: ListTodoIcon }` after Initiatives)

**Interfaces:**
- Consumes: `Board` from Task 4; `listTasks`, `createTask`, `moveTask`, `startTask`, `setTaskCompleted`, `stageOf`, `taskTitle` from Tasks 1 to 3; `listProjects` for project names.
- Produces (`work-board.ts`):
  - `type WorkBoard = Record<TaskStage, Task[]>`
  - `buildWorkBoard(tasks: Task[]): WorkBoard`: Current and Backlog by `compareRanks` then `id`; Icebox by `createdAt` descending then `id` descending; Done by `completedAt` descending.
  - `placeTask(board: WorkBoard, task: Task): WorkBoard`: removes the task from any column and inserts it into the column of its stage at its sorted place. Start, Reopen, and restores use it.
  - `replaceTask(board: WorkBoard, task: Task): WorkBoard`: replaces the task where it is, without sorting (after a save or a move answer).
  - `removeTask(board: WorkBoard, id: number): WorkBoard`
  - `WORK_COLUMNS`: the four `BoardColumnDef`s. The Icebox and Done are not ordered; Done is not draggable. `sortedIndex` for the Icebox is by `createdAt`, and for Done is 0.
- Produces (`WorkPage`): owns `WorkBoard` state, pending move counters, and the reload after failed moves, in the way `InitiativesPage` does. `onOpen` is a no-op until Task 6.

- [ ] **Step 1: Write the failing unit tests**

  In `work-board.test.ts`: `buildWorkBoard sorts each column`, `placeTask puts a started task among Current at its rank`, `placeTask puts a reopened task without rank at its created place in the Icebox`, `replaceTask keeps the place`.

  In `work-page.test.tsx` (mock `@tauri-apps/api/core`, render `WorkPage` in a `MemoryRouter`):
  - `moves the card at once and replaces it with the answer of move_task`
  - `reloads once after a failed move when no other move is waiting` (two moves, the first fails; `list_tasks` is called once, after the second answers)
  - `does not show a list that arrives after a move started`

- [ ] **Step 2: Run them to see them fail**

  Run: `bunx vitest run src/features/work/work-board.test.ts src/features/work/work-page.test.tsx`
  Expected: FAIL, the modules do not exist.

- [ ] **Step 3: Implement** the helpers, the card, the field, the page, the route, and the sidebar item. The page grid follows ADR 0005: four columns of equal width, each column's cards in a cell with `min-h-0` and `overflow-y-auto`.

- [ ] **Step 4: Run the unit tests to see them pass**

- [ ] **Step 5: Run the specs of the board**

  Run: `bunx vitest run src/features/work/work.spec.tsx` and `bunx vitest run --project browser src/features/work/work.browser.spec.tsx`
  Expected: PASS, except the tests that open the task sheet or delete from it (list them).

- [ ] **Step 6: Verify, commit, and push.** Run `bun run check`.

---

### Task 6: The task sheet

After this task, cards and "New task" open the task sheet, and the user can edit, create, and delete tasks with Undo on the Work page.

**Files:**
- Create: `src/features/work/task-sheet.tsx` (`TaskSheet`), `task-form.tsx` (`TaskForm`), `use-task-sheet.ts` (`useTaskSheet`), `task-project-field.tsx` and `task-initiative-field.tsx` (the two select boxes), and tests `task-form.test.tsx`, `use-task-sheet.test.tsx`
- Modify: `src/features/work/work-page.tsx`

**Interfaces:**
- Consumes: `getTask`, `createTask`, `updateTaskTitle`, `updateTaskDescription`, `setTaskProject`, `setTaskInitiative`, `listProjects`, `listInitiatives`, `getMeeting`; `useAutosave`, `SaveStatus`, `MarkdownEditor`, `useDelete`, `useFailureToast`.
- Produces:
  - `useTaskSheet(options: { onSaved?: (task: Task) => void; onCreated?: (task: Task) => void; onDeleted?: (id: number) => void; newButton?: RefObject<HTMLButtonElement> }): { openId: number | "new" | null; openTask: (id: number) => void; openDraft: () => void; sheet: ReactNode }`. It renders `TaskSheet` into `sheet`, so a page puts `{sheet}` anywhere in its tree.
  - `TaskSheet` props: `{ id: number | "new"; onClose; onSaved; onCreated; onDelete: (name: string) => void; finalFocus?: RefObject<HTMLElement> }`, like `InitiativeSheet`.

- [ ] **Step 1: Write the failing unit tests**

  In `task-form.test.tsx`:
  - `saves a draft only after a real change` (typing only spaces calls no `create_task`)
  - `saves the project at once and shows the answer of the backend` (the answer clears the initiative; the select shows "No initiative")
  - `puts the select back and shows a toast when the project cannot be saved`
  - `shows a deleted project as a selected choice with " (deleted)"`
  - `disables Initiative without a project`

  In `use-task-sheet.test.tsx`: `calls onSaved with each saved task`, `calls onCreated once when a draft is saved`.

- [ ] **Step 2: Run them to see them fail**

- [ ] **Step 3: Implement** the sheet, following `InitiativeSheet`, `InitiativeForm`, and `useInitiativeSheet`. The meeting link uses `useNavigate`, and the sheet closes first.

- [ ] **Step 4: Run the unit tests to see them pass**

- [ ] **Step 5: Connect the sheet to the Work page:** `onOpen` opens it; "New task" opens a draft; `onCreated` adds the card with `placeTask`; `onSaved` uses `replaceTask`; the delete callback removes the card and focuses "New task"; a change of `version` of the delete provider reloads the board.

- [ ] **Step 6: Run the specs**

  Run: `bunx vitest run src/features/work/`
  Expected: `work.spec.tsx` and `task-sheet.spec.tsx` PASS.

- [ ] **Step 7: Verify, commit, and push.** Run `bun run check`, including the browser project.

---

### Task 7: Action items are tasks

After this task, each action item has an "Open" button, removing an item can be undone, and checking an item is the same as completing its task.

**Files:**
- Modify: `src/features/tasks/action-items-panel.tsx`, `action-item-row.tsx`, and `action-items-panel.test.tsx`
- Modify: `src/features/meetings/meeting-editor-page.tsx` (owns `useTaskSheet` and renders its `sheet`)

**Interfaces:**
- Consumes: `useTaskSheet` from Task 6; `useDelete` with kind `"task"` from Task 3.
- Produces: `ActionItemRow` gets `onOpen: () => void` and its text field's autosave exposes `flush(): Promise<boolean>` to the panel, so that Open saves first. `ActionItemsPanel` gets `onOpen: (id: number) => void` and `savedTask?: Task` (the last task that the sheet saved, which the panel applies to its row).

- [ ] **Step 1: Write the failing unit tests in `action-items-panel.test.tsx`**

  - `saves a waiting text change before it opens the sheet` (type, click Open at once; `update_task_title` is called before `onOpen`)
  - `drops a waiting text change when the item is removed, and Undo brings back the saved title`
  - `shows the new title after the sheet saves`
  - `comes back at its place after Undo`

- [ ] **Step 2: Run them to see them fail**

- [ ] **Step 3: Implement.** Remove goes through `deleteItem({ kind: "task", id, name: actionItemName(text) })`. The panel reloads when `version` of the delete provider changes.

- [ ] **Step 4: Run the specs**

  Run: `bunx vitest run src/features/tasks/` and `bunx vitest run --project browser src/features/tasks/`
  Expected: `action-items.spec.tsx`, `action-items-work.spec.tsx`, and `action-items.browser.spec.tsx` PASS.

- [ ] **Step 5: Verify, commit, and push.** Run `bun run check`.

---

### Task 8: The tasks of a project and of an initiative

After this task, the project page and the sheet of an initiative list their open tasks, and a row opens the task sheet.

**Files:**
- Create: `src/features/work/task-list.tsx` (`TaskList`, the list "Tasks" that both places show) and `task-list.test.tsx`
- Modify: `src/features/projects/project-page.tsx` or `project-editor.tsx` (owns `useTaskSheet`; adds the list below "Meetings"), `project-details-sidebar.tsx` if the rows of the sidebar are fixed
- Modify: `src/features/initiatives/initiative-sheet.tsx`, `initiative-form.tsx` (the list between the description and the buttons, only for a saved initiative), `use-initiative-sheet.ts` (`onOpenTask`), `initiatives-page.tsx` and `project-initiatives.tsx` (pass `onOpenTask`)

**Interfaces:**
- Consumes: `listTasks`, `buildWorkBoard`, `taskTitle`, `useTaskSheet`.
- Produces:
  - `TaskList(props: { filter: (task: Task) => boolean; onOpen: (id: number) => void; savedTask?: Task }): JSX.Element`. It shows Current, then Backlog, then Icebox from `buildWorkBoard`, as a region named "Tasks", with "No tasks" when empty. It reloads when `version` of the delete provider changes, and applies `savedTask` (updates the row, or removes it when the filter no longer matches).
  - `useInitiativeSheet` gets `onOpenTask?: (id: number) => void`. When a row is clicked, the form flushes its autosave; if the flush fails, the sheet stays open; otherwise the hook closes the sheet and calls `onOpenTask`.

- [ ] **Step 1: Write the failing unit tests**

  In `task-list.test.tsx`: `orders Current, Backlog, then Icebox`, `leaves out completed tasks`, `removes a row whose saved task moved to another project`.

  In `initiative-form.test.tsx`: `keeps the sheet open when the change cannot be saved before a task opens`.

- [ ] **Step 2: Run them to see them fail**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the specs**

  Run: `bunx vitest run src/features/projects/ src/features/initiatives/`
  Expected: `project-tasks.spec.tsx` PASS, and every earlier spec in these folders still passes.

- [ ] **Step 5: Verify the whole feature**

  Run: `bun run check`
  Expected: every check passes, including all executable specs listed at the top of this plan.

- [ ] **Step 6: Commit and push**

---

After Task 8, convert the draft PR to an open PR and wait for human review, as the development process says.
