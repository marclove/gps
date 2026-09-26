# Meeting Action Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a panel of action items (a checklist) at the right side of the meeting editor page, where the user adds, checks off, edits, and removes items that are stored in a new `tasks` table.

**Architecture:** The Rust backend gets a `tasks` table, a `tasks.rs` module with all of its SQL, and five commands, one for each user action (ADR 0010). The frontend gets `src/lib/tasks.ts`, which holds the `Task` type and the only `invoke` calls for tasks, and a panel in `src/features/tasks/` that loads and saves its items by itself, separately from the meeting's autosave. The meeting editor places the panel in a second grid column.

**Tech Stack:** Rust with `rusqlite` and `rusqlite_migration`; React 19 with TypeScript; Tailwind CSS v4; shadcn components on Base UI (`@base-ui/react`); Vitest with React Testing Library in jsdom, and Vitest browser mode in WebKit.

**Spec:** `docs/specs/0005-meeting-action-items.md`, with `docs/adrs/0010-store-tasks-in-their-own-table.md`, `docs/adrs/0011-show-meeting-details-in-a-sidebar.md` (Task 6), and `docs/adrs/0012-show-failures-of-actions-as-toasts.md` (Task 7). The executable specs are `src/features/tasks/action-items.spec.tsx`, `src/features/tasks/action-items.browser.spec.tsx`, and, for Task 7, the archive failure tests in `src/features/meetings/archive.spec.tsx`. Do not change the executable specs to make them pass. If one seems wrong, stop and ask a human.

## Global Constraints

- Words: the user interface says "action item". The database, the backend, and `src/lib/tasks.ts` say "task".
- Exact copy: region and heading "Action items"; field "Add action item"; each item's field "Action item"; checkbox `Complete "<text>"`; button `Remove "<text>"`; empty text shows as "Untitled action item"; "No action items yet"; "Loading…"; "Couldn't load action items" with a "Retry" button; "Couldn't add the action item. Try again."; "Couldn't save the action item. Try again."; "Couldn't remove the action item. Try again."
- The panel is 18rem wide, always visible, and to the right of the name, date, toolbar, and notes, below the page header. Only its list scrolls (ADR 0005).
- A checked item's text uses the theme color `--muted-foreground` (`text-muted-foreground`); an unchecked item's text uses `--foreground` (`text-foreground`).
- Text changes are saved with `useAutosave` (500 milliseconds after the last change). Adding, checking, unchecking, and removing are sent at once.
- Items are shown oldest first (`created_at`, then `id`) and never reorder.
- The panel shows at most one alert at a time. A new failure replaces it. Any change to action items that succeeds clears it.
- Run `bun run fmt` after editing TypeScript and `bun run fmt:rust` after editing Rust. All tests except the two new feature specs must pass at the end of every task. Do not reference ADR or plan sections in code comments. Public items get docstrings in ASD-STE100 style (short sentences, simple words, one instruction per sentence), like the existing ones.

## Review Focus

These cases are not tested by the feature specs, but a user is likely to meet them. Each line has a test in the task that owns the code.

1. The user checks an item while a change to its text is still waiting to be saved. The text in the field must not go back to the older text that `set_task_completed` returns. (Task 4)
2. The user checks and unchecks an item quickly, before the first save returns. The checkbox and the stored value must both end unchecked. (Task 3)
3. The user presses Enter to add an item, then types and presses Enter again before the first item is saved. Both items must be added in the order typed, and the field must end empty, not lose the second text. (Task 2)
4. The user types in the add field with an input method, such as Japanese kana to kanji conversion, and presses Enter to confirm a conversion. That Enter must not add an item. (Task 2)
5. The user edits an item's text and clicks its remove button before the save, and the removal fails. The edited text must still be saved, not silently dropped. (Task 5)

---

## File Structure

| File                                              | Responsibility                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src-tauri/src/db.rs` (modify)                    | Turn on foreign keys; migration that creates `tasks`.                                          |
| `src-tauri/src/tasks.rs` (create)                 | `Task` type, `Error` type, and all SQL for tasks, with its tests.                              |
| `src-tauri/src/lib.rs` (modify)                   | Five thin commands; `Database::run` accepts any error that can be shown as text.               |
| `docs/data-model.md` (modify)                     | ERD and column descriptions for `tasks` and its relationship to `meetings`.                    |
| `src/lib/tasks.ts` (create), `tasks.test.ts`      | `Task` type and the five `invoke` calls.                                                       |
| `src/components/ui/checkbox.tsx` (create)         | shadcn checkbox, added with the shadcn command.                                                |
| `src/features/tasks/action-items-panel.tsx`       | The panel: loading, list state, add field, alert, focus after removal.                        |
| `src/features/tasks/action-item-row.tsx`          | One item: checkbox, text field with its own autosave, remove button.                           |
| `src/features/tasks/action-items-panel.test.tsx`  | Unit tests for the Review Focus cases.                                                         |
| `src/features/meetings/meeting-editor.tsx` (modify) | Place the panel in a second column.                                                          |
| Existing tests with fake backends (modify)        | Answer `list_meeting_tasks`, so the panel does not show a load error or crash in their tests.  |

---

### Task 1: Store tasks in the database and expose the commands

This is a backend slice. After it, the application has the table and the commands, and nothing in the user interface changes.

**Files:**
- Modify: `src-tauri/src/db.rs`, `src-tauri/src/lib.rs`, `docs/data-model.md`
- Create: `src-tauri/src/tasks.rs` (tests in its `#[cfg(test)] mod tests`)

**Interfaces:**
- Produces (Rust, `tasks.rs`):
  - `pub struct Task { pub id: i64, pub meeting_id: Option<i64>, pub description: String, pub created_at: String, pub updated_at: String, pub completed_at: Option<String> }` with `#[derive(Debug, Clone, PartialEq, Eq, Serialize)]` and `#[serde(rename_all = "camelCase")]`.
  - `pub enum Error { NotFound(i64), MeetingNotFound(i64), Database(rusqlite::Error) }`, with `Display` messages `task {id} not found`, `meeting {id} not found`, and `database error: {error}`, and `From<rusqlite::Error>`.
  - `pub fn list_for_meeting(connection: &Connection, meeting_id: i64) -> Result<Vec<Task>, Error>`
  - `pub fn create(connection: &Connection, meeting_id: i64, description: &str) -> Result<Task, Error>`
  - `pub fn update_description(connection: &Connection, id: i64, description: &str) -> Result<Task, Error>`
  - `pub fn set_completed(connection: &Connection, id: i64, completed: bool) -> Result<Task, Error>`
  - `pub fn delete(connection: &Connection, id: i64) -> Result<(), Error>`
- Produces (commands in `lib.rs`; Tauri turns `meeting_id` into the JavaScript argument `meetingId`):
  - `list_meeting_tasks(meeting_id: i64) -> Vec<Task>`
  - `create_task(meeting_id: i64, description: &str) -> Task`
  - `update_task_description(id: i64, description: &str) -> Task`
  - `set_task_completed(id: i64, completed: bool) -> Task`
  - `delete_task(id: i64) -> ()`

- [ ] **Step 1: Write the failing tests in `tasks.rs`**

Create `tasks.rs` with only `mod tests` and `mod tasks;` in `lib.rs`, so the tests compile against the names above once they exist. Use `db::open_in_memory()` and `meetings::create(&connection, "2026-09-24")` to make meetings. To check that a timestamp changes, first set it to `'2000-01-01T00:00:00.000Z'` with SQL, because two calls can happen in the same millisecond. Tests:

- `list_for_meeting_returns_only_that_meetings_tasks_oldest_first`: create tasks A (meeting 1), X (meeting 2), B (meeting 1); expect descriptions `["A", "B"]` for meeting 1.
- `create_returns_a_task_that_is_not_completed`: `meeting_id == Some(meeting.id)`, `description == "Send the deck"`, `completed_at == None`, `created_at == updated_at`.
- `create_fails_for_a_meeting_that_does_not_exist`: `create(&connection, 999, "x")` matches `Err(Error::MeetingNotFound(999))`.
- `update_description_changes_the_text_and_updated_at`; and `update_description_fails_for_an_unknown_task` matches `Err(Error::NotFound(999))`.
- `set_completed_records_the_first_completion_time_and_clears_it`: after `true`, `completed_at` is `Some(t)` and `updated_at` changed; set `completed_at` to `'2000-01-01T00:00:00.000Z'` with SQL, call `true` again, expect it unchanged; after `false`, expect `None`. `set_completed(&connection, 999, true)` matches `Err(Error::NotFound(999))`.
- `delete_removes_the_task`: afterwards `list_for_meeting` is empty; deleting again matches `Err(Error::NotFound(id))`.
- `archiving_a_meeting_keeps_its_tasks`: create a task, call `meetings::archive`, then expect `list_for_meeting` to return the same task, equal in every field.

In `db.rs` tests, add:

- `foreign_keys_are_enforced`: raw `INSERT INTO tasks (meeting_id, description, created_at, updated_at) VALUES (999, 'x', 't', 't')` returns an error.
- Extend `open_creates_the_file_and_can_be_opened_again`: create a meeting and a task before closing, then expect `tasks::list_for_meeting` to return the task after opening again.
- `migration_keeps_existing_meetings_in_the_list` must still pass with the new migration.

- [ ] **Step 2: Run the tests and see them fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: compile errors for the missing items in `tasks.rs`, or a missing `tasks` table.

- [ ] **Step 3: Add the migration and turn on foreign keys in `db.rs`**

Append to `MIGRATIONS`:

```sql
CREATE TABLE tasks (
    id           INTEGER PRIMARY KEY,
    meeting_id   INTEGER REFERENCES meetings(id),
    description  TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX tasks_meeting_id ON tasks(meeting_id);
```

In `open` and `open_in_memory`, call `connection.pragma_update(None, "foreign_keys", true)` before `migrate`. Put it in one private helper that both call, so the two cannot drift.

- [ ] **Step 4: Implement `tasks.rs`**

Follow `meetings.rs`: a module doc comment, the shared `NOW` expression (copy the constant, or make the one in `meetings.rs` `pub(crate)` and use it), a private `get(connection, id) -> Result<Option<Task>, Error>`, and a private `task_from_row`. Decisions:

- `list_for_meeting`: `WHERE meeting_id = ?1 ORDER BY created_at, id`.
- `create`: first check `SELECT EXISTS(SELECT 1 FROM meetings WHERE id = ?1)` and return `MeetingNotFound`, so the error message is clear. The foreign key is the second line of defense. Store the description as given; the frontend trims it.
- `update_description` and `set_completed` set `updated_at = {NOW}` and return `NotFound` when no row changed. `set_completed(true)` uses `completed_at = coalesce(completed_at, {NOW})`; `false` sets `NULL`.
- `delete`: `DELETE ... WHERE id = ?1`; `NotFound` when no row changed.

- [ ] **Step 5: Add the commands in `lib.rs`**

Change `Database::run` to `fn run<T, E: std::fmt::Display>(&self, operation: impl FnOnce(&Connection) -> Result<T, E>) -> Result<T, String>`. Add the five commands with the same `#[expect(clippy::needless_pass_by_value, reason = ...)]` as the others, and add them to `generate_handler!`.

- [ ] **Step 6: Update `docs/data-model.md`**

Add the `tasks` entity with a comment for each column, like `meetings`, and the relationship `meetings |o--o{ tasks : "has action items"`. Replace "The database has no other tables yet, so there are no relationships." with a `### tasks` section that explains: `meeting_id` may be empty for a task outside a meeting (none are created yet); `completed_at` is set when the user checks the task off, keeps the first time, and is cleared when the user unchecks it; `updated_at` changes with the description or the completion; archiving a meeting does not change its tasks; foreign keys are enforced (ADR 0010).

- [ ] **Step 7: Run the Rust checks**

Run: `bun run fmt:rust && bun run lint:rust && bun run test:rust`
Expected: no warnings, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri docs/data-model.md
git commit -m "Store tasks in the database and add the task commands"
```

---

### Task 2: Show the panel and add action items

After this task, the user sees the panel on every meeting, can add items, and sees them again when the meeting opens. The item text is shown in a read-only field; the checkbox and remove button come in later tasks.

**Files:**
- Create: `src/lib/tasks.ts`, `src/lib/tasks.test.ts`, `src/features/tasks/action-items-panel.tsx`, `src/features/tasks/action-item-row.tsx`, `src/features/tasks/action-items-panel.test.tsx`
- Modify: `src/features/meetings/meeting-editor.tsx`
- Modify (fake backends): `src/features/meetings/archive.spec.tsx`, `meetings.spec.tsx`, `scrolling.browser.spec.tsx`, `meeting-editor-page.test.tsx`, `meeting-editor.browser.test.tsx`, `src/components/section-nav.spec.tsx`

**Interfaces:**
- Consumes: the commands from Task 1.
- Produces (`src/lib/tasks.ts`):
  - `export type Task = { id: number; meetingId: number | null; description: string; createdAt: string; updatedAt: string; completedAt: string | null }`
  - `listMeetingTasks(meetingId: number): Promise<Task[]>`
  - `createTask(meetingId: number, description: string): Promise<Task>`
  - `updateTaskDescription(id: number, description: string): Promise<Task>`
  - `setTaskCompleted(id: number, completed: boolean): Promise<Task>`
  - `deleteTask(id: number): Promise<void>`
- Produces (`action-items-panel.tsx`): `export function ActionItemsPanel({ meetingId }: { meetingId: number })`, and a message state `type Message = "add" | "save" | "remove" | null` that later tasks set. Keep the texts for the three messages in one `Record<Exclude<Message, null>, string>`.
- Produces (`action-item-row.tsx`): `export function ActionItemRow(props: { task: Task; inputRef: (element: HTMLInputElement | null) => void })`. Later tasks add props to it. Also export `actionItemName(text: string): string`, which returns "Untitled action item" when `text.trim()` is empty, like `displayName` in `src/lib/meetings.ts`.

- [ ] **Step 1: Write the failing tests**

- `src/lib/tasks.test.ts`: like `src/lib/meetings.test.ts`, call all five functions and expect `invoke.mock.calls` to equal `[["list_meeting_tasks", { meetingId: 1 }], ["create_task", { meetingId: 1, description: "Send the deck" }], ["update_task_description", { id: 3, description: "Call Sam" }], ["set_task_completed", { id: 3, completed: true }], ["delete_task", { id: 3 }]]`.
- `action-items-panel.test.tsx` renders `<ActionItemsPanel meetingId={1} />` with `invoke` mocked (see `src/lib/meetings.test.ts` for the `vi.hoisted` pattern) and a small command handler. Review Focus tests for this task:
  - `adds two items typed quickly, in order, and ends with an empty field`: make `create_task` return promises that you resolve by hand. Type "First{Enter}Second{Enter}", resolve the first, then the second. Expect the item fields to have the values `["First", "Second"]` and the add field to have the value `""`.
  - `does not add an item on Enter that confirms an input method composition`: `fireEvent.keyDown(addField, { key: "Enter", isComposing: true })` after setting its value; expect no `create_task` call.

- [ ] **Step 2: Run them and see them fail**

Run: `bunx vitest run --project unit src/lib/tasks.test.ts src/features/tasks/action-items-panel.test.tsx`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Implement `src/lib/tasks.ts`**

Follow `src/lib/meetings.ts`, with a docstring on each export.

- [ ] **Step 4: Implement the panel and the row**

The panel is `<section aria-labelledby={headingId}>` with the classes `grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-l`:

- Row 1: `<h2 id={headingId}>Action items</h2>`.
- Row 2, the only area that scrolls (`min-h-0 overflow-y-auto`): "Loading…", or "Couldn't load action items" with a `Retry` button, or "No action items yet", or a `<ul>` of `ActionItemRow`, keyed by `task.id`.
- Row 3: the alert, `<p role="alert">` only when the message is not `null`, and the add field, `<Input aria-label="Add action item" placeholder="Add action item">`.

Load with the same pattern as `MeetingLoader` in `meeting-editor-page.tsx` (a `current` flag and an `attempt` counter for Retry).

Adding, on `keyDown` of Enter when `!event.nativeEvent.isComposing`: trim the value. If it is empty, do nothing. Otherwise clear the field at once and call `createTask`. On success, append the returned task and clear the message. On failure, set the message to `"add"` and, if the field is still empty, put the text back. Do not block the field while a create is in progress.

The row, for now: `<li>` with `<Input aria-label="Action item" readOnly value={task.description}>` and `ref={inputRef}`. Give the panel a `Map<number, HTMLInputElement>` of these refs now; Task 5 uses it to move focus.

- [ ] **Step 5: Place the panel in the meeting editor**

In `meeting-editor.tsx`, change the outer grid to `grid-rows-[auto_minmax(0,1fr)]`: the page header, then a grid with `grid-cols-[minmax(0,1fr)_18rem] min-h-0`. Its left cell is the existing name and date row and `NotesEditor` in a grid with `grid-rows-[auto_minmax(0,1fr)] min-h-0`. Its right cell is `<ActionItemsPanel meetingId={meeting.id} />`.

- [ ] **Step 6: Update the fake backends of existing tests**

In each file listed under **Files** whose fake answers `get_meeting`, answer `list_meeting_tasks` with `[]`. `meeting-editor-page.test.tsx` uses `mockResolvedValue` and `mockResolvedValueOnce` in order. The panel's extra call would take one of those values, so change those tests to a handler that answers by command name. Say in the commit message that these tests changed because the editor page now calls `list_meeting_tasks`.

- [ ] **Step 7: Run the tests**

Run: `bun run fmt && bun run typecheck && bun run lint && bun run test`
Expected: everything passes, except these parts of the feature specs, which need later tasks. In `action-items.spec.tsx`, only these tests may still fail: those that use a checkbox or a remove button, and those in "checking off", "changing the text", "removing", and "messages". In `action-items.browser.spec.tsx`, only the test "grays out the text" may still fail.

- [ ] **Step 8: Commit**

```bash
git add src docs
git commit -m "Show the action items panel and add action items"
```

---

### Task 3: Check off action items

**Files:**
- Create: `src/components/ui/checkbox.tsx` (`bunx --bun shadcn@latest add checkbox`, then `bun run fmt`, and replace its icon import with `CheckIcon` from `lucide-react` if the command leaves a placeholder)
- Modify: `action-item-row.tsx`, `action-items-panel.tsx`, `action-items-panel.test.tsx`

**Interfaces:**
- Consumes: `setTaskCompleted` from Task 2.
- Produces: new `ActionItemRow` props `completed: boolean` and `onCompletedChange: (completed: boolean) => void`. The panel keeps `completed` for each item in its own state. This state starts from `task.completedAt !== null`.

- [ ] **Step 1: Write the failing Review Focus test in `action-items-panel.test.tsx`**

- `ends unchecked after a quick check and uncheck`: make `set_task_completed` resolve by hand. Click the checkbox twice, then resolve the two calls in order, each with the task that the fake stores. Expect the checkbox not checked, and expect the last `set_task_completed` call to have `completed: false`.

- [ ] **Step 2: Run them and see them fail**

Run: `bunx vitest run --project unit src/features/tasks/action-items-panel.test.tsx`
Expected: FAIL, because no checkbox exists.

- [ ] **Step 3: Implement**

In the row, before the text field, add `<Checkbox aria-label={`Complete "${actionItemName(text)}"`} checked={completed} onCheckedChange={onCompletedChange} />`, where `text` is the text shown in the field. Give the field `text-muted-foreground` when `completed` and `text-foreground` when not.

In the panel, on change: remember the value before, set the new value at once, and call `setTaskCompleted`. On success, clear the message, but do not replace the item's state with the returned task, so a later click is never overwritten by an earlier response. On failure, set the message to `"save"` and put back the value from before this click, but only if no later click on that item happened.

- [ ] **Step 4: Run the tests**

Run: `bun run fmt && bun run typecheck && bun run lint && bun run test`
Expected: everything passes, except the feature spec tests that use the remove button, and the tests in "changing the text", "removing", and "messages". The browser test "grays out the text" now passes.

- [ ] **Step 5: Commit**

```bash
git add src components.json
git commit -m "Check off action items"
```

---

### Task 4: Change the text of action items

**Files:**
- Modify: `action-item-row.tsx`, `action-items-panel.tsx`, `action-items-panel.test.tsx`

**Interfaces:**
- Consumes: `updateTaskDescription`, `useAutosave` from `src/features/meetings/use-autosave.ts`.
- Produces: new `ActionItemRow` prop `onSaveResult: (ok: boolean) => void`. The panel sets the message to `"save"` when `ok` is false and clears it when `ok` is true.

- [ ] **Step 1: Write the failing Review Focus test**

- `keeps the typed text when the item is checked before the text is saved`: type " to Alex" into "Send the deck", click its checkbox at once, and let `set_task_completed` return the task with the old description. Expect the field to still have the value "Send the deck to Alex", and expect `update_task_description` to be called later with that text.

- [ ] **Step 2: Run it and see it fail**

Run: `bunx vitest run --project unit src/features/tasks/action-items-panel.test.tsx`
Expected: FAIL, because the field is read-only.

- [ ] **Step 3: Implement**

The row keeps its own `text` state, which starts from `task.description`, and never takes it from props again. The panel's `key={task.id}` keeps it per item. Remove `readOnly`. Call `useAutosave(text, save)` with `save = (description) => updateTaskDescription(task.id, description)`. The checkbox and the remove button take their names from `text`. When the autosave `status` becomes `"error"`, call `onSaveResult(false)`. When it becomes `"saved"`, call `onSaveResult(true)`. Do this in an effect that watches `status`.

- [ ] **Step 4: Run the tests**

Run: `bun run fmt && bun run typecheck && bun run lint && bun run test`
Expected: everything passes, except the feature spec tests that use the remove button, and the tests in "removing" and "messages".

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Change the text of action items"
```

---

### Task 5: Remove action items

**Files:**
- Modify: `action-item-row.tsx`, `action-items-panel.tsx`, `action-items-panel.test.tsx`

**Interfaces:**
- Consumes: `deleteTask`.
- Produces: new `ActionItemRow` prop `onRemove: () => Promise<boolean>`, which resolves to `true` when the item was deleted and `false` when the delete failed.

- [ ] **Step 1: Write the failing Review Focus test**

- `saves the edited text when the removal fails`: make `delete_task` reject. Type " for Friday" into "Book a room", then click `Remove "Book a room for Friday"`. Expect the alert "Couldn't remove the action item. Try again.", and expect `update_task_description` to be called with "Book a room for Friday" within 2 seconds.

- [ ] **Step 2: Run it and see it fail**

Run: `bunx vitest run --project unit src/features/tasks/action-items-panel.test.tsx`
Expected: FAIL, because no remove button exists.

- [ ] **Step 3: Implement**

The row gets `<Button variant="ghost" size="icon-sm" aria-label={`Remove "${actionItemName(text)}"`}>` with an `XIcon`, after the field. Show it only on hover or focus with the same pattern as the archive button in `meetings-page.tsx`: `group` on the `<li>`, and `opacity-0 group-hover:opacity-100 focus-visible:opacity-100` on the button. Use the size names that `src/components/ui/button.tsx` defines.

To discard a waiting text change only when the delete succeeds, the row keeps `removal: Promise<boolean> | null` in a ref. On click it sets `removal.current = onRemove()`. The autosave `save` function becomes: if `removal.current` is set, wait for it. If the delete succeeded, resolve without calling the backend. Otherwise clear `removal.current` and save as usual.

In the panel, `onRemove` calls `deleteTask`. On success, it removes the item from the list, clears the message, and records the removed index. An effect then moves focus to the field at that index, or to the one before it, or to the add field. Use the refs map from Task 2. On failure, it sets the message to `"remove"` and resolves `false`.

- [ ] **Step 4: Run the full check**

Run: `bun run check`
Expected: everything passes, including both feature specs.

- [ ] **Step 5: Ask a human to check by hand**

Ask a human to run `bun run tauri dev` and check the two things that the spec lists as not checked automatically: the remove button appears only when the pointer is over its row, and items are still there after the application is closed and opened again.

- [ ] **Step 6: Commit and push**

```bash
git add src
git commit -m "Remove action items"
git push
```

---

## Tasks 6 and 7: meeting details sidebar and failure toasts

Tasks 1 to 5 are done. After a design review, the right column became a sidebar for the whole meeting (ADR 0011), and failures of actions became toasts on every page (ADR 0012). Spec 0005 and the executable specs were updated first, and 13 of their tests fail until these two tasks are done.

### Global Constraints for Tasks 6 and 7

- Sidebar: an `<aside aria-label="Meeting details">`, 18rem wide, with a border on its left side. It is as tall as the main area and starts at its top, beside the page header.
- Sidebar order from top to bottom: a row with the visible label "Date" and the date field (accessible name "Meeting date"); the "Archive" button; a separator; the action items panel (region "Action items").
- The meeting name is alone on its row in the left column. The page header keeps the breadcrumb and the save status, and no longer has the Archive button.
- Only the action items list scrolls. The date, the Archive button, the heading, and the "Add action item" field stay in place.
- Failure toasts: "Couldn't archive the meeting. Try again.", "Couldn't add the action item. Try again.", "Couldn't save the action item. Try again.", "Couldn't remove the action item. Try again." Each has only a "Close" button, a timeout of 8000 milliseconds, and Base UI's default priority, and it does not take focus.
- At most one failure toast is open. `show` closes the open one first. A successful archive, add, check or uncheck, text save, or removal calls `clear()`.
- "Couldn't load action items" with Retry, and the meeting's "Couldn't save" status with Retry, stay where they are.

### Review Focus for Tasks 6 and 7

1. The date field in the narrow sidebar must show the whole date, including the year, without being cut off. (Task 6)
2. The Tab key must follow the order on the screen in the sidebar: from the date field to the Archive button, then into the action items. (Task 6)
3. When the archive toast and a failure toast are open together, the user must be able to read both messages and reach both Close buttons. (Task 7)
4. A failure toast that the editor page opened must still close when the user opens the Meetings page and an archive there succeeds. The provider in `App.tsx` owns the toast, so this works across pages. (Task 7)

### Task 6: Move the date and the Archive button into a full-height meeting details sidebar

**Files:**
- Modify: `src/features/meetings/meeting-editor.tsx`, `src/features/tasks/action-items-panel.tsx` (only if its outer classes must change to fit the sidebar)
- Create: `src/features/meetings/meeting-details-sidebar.tsx`
- Test: `src/features/meetings/meeting-editor.browser.test.tsx` (Review Focus 1), `src/features/meetings/meeting-editor-page.test.tsx` (Review Focus 2)

**Interfaces:**
- Produces: `export function MeetingDetailsSidebar({ properties, actions, lists }: { properties: ReactNode; actions: ReactNode; lists: ReactNode })`. It renders the `<aside>` with the three parts as a grid with the rows `auto auto minmax(0,1fr)`: properties and actions, the separator, and the lists. The editor passes the date row, the Archive button, and `<ActionItemsPanel meetingId={meeting.id} />` in explicit slots. Use named props (`properties`, `actions`, `lists`), not an order that the caller must know.

- [ ] **Step 1: Write the failing tests**
  - In `meeting-editor.browser.test.tsx`, add `shows the whole date in the sidebar`: open a meeting dated `2026-09-24`, and expect the "Meeting date" field's `scrollWidth` to be less than or equal to its `clientWidth`.
  - In `meeting-editor-page.test.tsx`, add `moves focus from the date to Archive to the action items with Tab`: focus "Meeting date", press Tab and expect "Archive" to have focus, then press Tab and expect focus inside the region "Action items".
- [ ] **Step 2: Run them, and the sidebar tests of the feature specs, and see them fail**
  Run: `bunx vitest run src/features/meetings/meeting-editor.browser.test.tsx src/features/meetings/meeting-editor-page.test.tsx src/features/tasks/action-items.spec.tsx src/features/tasks/action-items.browser.spec.tsx`
  Expected: FAIL, because there is no "Meeting details" landmark.
- [ ] **Step 3: Implement**
  - Change the editor's grid to two columns, `grid-cols-[minmax(0,1fr)_18rem]`. The left column is a grid with the rows `auto auto minmax(0,1fr)`: the page header, the name row, and the notes editor. The right column is the sidebar and spans the full height.
  - Move the date `Input`, with its `COMPLETE_DATE` guard, into a row with a visible `<label htmlFor={dateId}>Date</label>`. Keep `aria-label="Meeting date"` on the input, so its accessible name stays "Meeting date", which contains the visible label.
  - Move the Archive `Button` into the actions part. Its `archiving` state and `archive()` function stay in `MeetingEditor`. Until Task 7 replaces it with a toast, render the "Couldn't archive the meeting. Try again." alert directly below the button.
  - Use the shadcn `Separator` from `src/components/ui/separator.tsx`.
- [ ] **Step 4: Run the tests**
  Run: `bun run fmt && bun run typecheck && bun run lint && bun run test`
  Expected: all tests pass, except these feature spec tests, which Task 7 makes pass: the failure toast tests in `action-items.spec.tsx` (those that call `findFailureToast`, and "shows a failure toast with only a Close button, which closes it") and the three archive failure tests in `archive.spec.tsx`.
- [ ] **Step 5: Commit**
  `git commit -m "Show the date and Archive in a meeting details sidebar"`

### Task 7: Show failures of actions as toasts

**Files:**
- Create: `src/components/failure-toast-provider.tsx`, `src/components/use-failure-toast.ts`, `src/components/failure-toast-provider.test.tsx`
- Modify: `src/App.tsx`, `src/components/toaster.tsx` (its comment and, if Review Focus 3 needs it, how stacked toasts show), `src/features/meetings/meetings-page.tsx`, `src/features/meetings/meeting-editor.tsx`, `src/features/tasks/action-items-panel.tsx`
- Modify tests that check the old inline messages: `src/features/meetings/meetings-page.test.tsx`, `src/features/meetings/meeting-editor-page.test.tsx`, `src/features/tasks/action-items-panel.test.tsx`. Render them inside `Toaster` and `FailureToastProvider`, and look for the message in the region "Notifications". Say in the commit message that these tests changed because ADR 0012 moves the messages into toasts.

**Interfaces:**
- Produces (`use-failure-toast.ts`, a separate file for the same reason as `use-archive.ts`): `export function useFailureToast(): { show: (message: string) => void; clear: () => void }`.
- Produces (`failure-toast-provider.tsx`): `export function FailureToastProvider({ children }: { children: ReactNode })`. It uses `useToastManager()` from the toast provider around it, and keeps the id of the open failure toast in a ref. `show` closes that toast if there is one, then calls `add({ title: message, timeout: 8000 })`. `clear` closes it. Mount it in `App.tsx` inside `Toaster`, next to `ArchiveProvider`.

- [ ] **Step 1: Write the failing tests** in `failure-toast-provider.test.tsx`, using a component that calls the hook:
  - `shows the message in the Notifications region with only a Close button`.
  - `replaces the open failure toast when another failure is shown`: call show twice with different texts, and expect only the second text.
  - `closes the failure toast on clear`.
  - `keeps an archive toast open when a failure toast opens`: add a toast with the manager directly, then call show, and expect both titles. This covers the rule that the two kinds of toast can be open together.
  - In `archive.browser.spec.tsx` or a new browser test, add `shows both messages and both Close buttons when an archive toast and a failure toast are open` (Review Focus 3): both titles and both Close buttons are visible (`elementFromPoint` at their centers returns them), and clicking each Close button closes its toast.
  - In `meeting-editor-page.test.tsx` or `archive.spec`-style app test, add Review Focus 4: a failed archive on the editor page, then open the Meetings page and archive a meeting there successfully. The failure toast closes.
- [ ] **Step 2: Run them and see them fail**
  Run: `bunx vitest run src/components src/features/meetings`
  Expected: FAIL, because the provider does not exist.
- [ ] **Step 3: Implement the provider and the hook, and mount them.** Update the comment in `toaster.tsx`, because more than one toast can now be open. If the Review Focus 3 test shows that Base UI collapses the stack and hides the older toast, make the viewport show both toasts, for example by keeping the stack expanded.
- [ ] **Step 4: Use the hook**
  - `meetings-page.tsx` and `meeting-editor.tsx`: when an archive fails, call `show("Couldn't archive the meeting. Try again.")` and remove the inline alert. When an archive succeeds, call `clear()`.
  - `action-items-panel.tsx`: replace the `Message` state and the alert with `show` using the same three texts, and replace each place that sets the message to `null` with `clear()`. Keep the texts in one `Record`. Keep the rules that already guard the message, such as showing no failure for an item that was removed.
- [ ] **Step 5: Run the full check**
  Run: `bun run check`
  Expected: everything passes, including all three executable specs.
- [ ] **Step 6: Commit**
  `git commit -m "Show failures of actions as toasts"`
