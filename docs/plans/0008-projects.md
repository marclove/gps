# Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add projects: a Projects section with a list and a page for each project, one project for every initiative, an optional project for every meeting, and a roadmap that shows and filters by project.

**Architecture:** The work goes in five vertical slices. Each slice leaves the application working. The first slice adds the table `projects`, its backend module, and the Projects section with the project page for the name and the description. The second slice puts every initiative in a project: the migration, the backend rules, and the "Project" select box in the initiative sheet. The third slice shows the project on each card and adds the filter to the roadmap. The fourth slice adds the lists of initiatives and meetings to the project page. The fifth slice adds the "Project" row to the meeting sidebar.

**Tech Stack:** Rust with `rusqlite` 0.40 and `rusqlite_migration` 2.6; React 19 with TypeScript and React Router (`MemoryRouter`); shadcn components on Base UI; Vitest with React Testing Library in jsdom, and Vitest browser mode in WebKit.

**Spec:** `docs/specs/0008-projects.md`, argued in `docs/adrs/0019-store-projects-and-place-each-initiative-in-one.md` and `docs/adrs/0020-show-projects-on-pages-and-filter-the-roadmap.md`. Read all three before you start a task.

The executable specs and their shared fake backend are already written and must not change to make them pass:
- `src/features/projects/projects.spec.tsx`
- `src/features/projects/project-page.spec.tsx`
- `src/features/initiatives/initiative-project.spec.tsx`
- `src/features/initiatives/filtered-roadmap.browser.spec.tsx`
- `src/features/meetings/meeting-project.spec.tsx`
- `src/features/initiatives/roadmap.spec.tsx`, `initiative-sheet.spec.tsx`, `roadmap.browser.spec.tsx`
- `src/features/meetings/meeting-initiative.spec.tsx`
- `src/test/fake-roadmap-backend.ts`

If one of them seems wrong, stop and ask a human. The executable specs pass only after the last task. Every other test must pass after every task.

## Global Constraints

- **Commands and results** are exactly the table in "Backend contract" of the spec. Arguments and fields are camelCase on the frontend and snake_case in Rust, with `#[serde(rename_all = "camelCase")]`. Outcomes use `#[serde(tag = "status", rename_all = "camelCase")]`, as `initiatives::CreateOutcome` does.
- **Exact copy:** "Projects", "New project", "No projects yet", "Couldn't load projects", "Untitled project", "Project name", "Project details", "Initiatives", "Meetings", "No initiatives", "No meetings", "This project doesn't exist.", "Back to Projects", `Another project is named "<name>".`, `Another initiative in "<project>" is named "<name>".`, `Couldn't delete "<name>" because it still has initiatives.`, "Couldn't delete the project. Try again.", "Couldn't restore the project. Try again.", `Couldn't restore "<name>" because another project has that name.`, `Couldn't restore "<name>" because its project is deleted.`, "Couldn't move the initiative to the project. Try again.", "Create a project first.", "All projects", "Couldn't change the project. Try again." Select labels: "Project" (sheet and roadmap filter), "Meeting project" (meeting sidebar).
- **Names of projects** are trimmed, unique without regard to case among projects that are not deleted, and empty names never conflict. Sort projects everywhere by the shown name with `localeCompare(…, undefined, { sensitivity: "base" })`.
- **Migrations:** the entries in `db.rs` today do not change. New ones go after them, and each ends with `.foreign_key_check()`.
- **Documentation:** `docs/data-model.md` changes in the same task as the columns it describes. Docstrings use ASD-STE100 style and do not name sections of an ADR or a plan.
- Frontend code for projects lives in `src/features/projects/`. `src/lib/projects.ts` holds the only `invoke` calls for projects.
- Run `bun run fmt` after editing TypeScript and `bun run fmt:rust` after editing Rust. Run `bun run check` before each commit, and expect only the executable specs above to fail until Task 5.

## Review Focus

1. **Updating a database that has data.** Initiatives, also completed and deleted ones, must land in "Unsorted" with their ranks, and assigned meetings must get the project of their initiative. An empty database must get no project. Task 2 tests both.
2. **Moving an initiative into a project where a deleted initiative has the same name.** The move must succeed, as a create does. Task 2 tests it.
3. **Setting a meeting's project to the project it already has.** The select box can send the same value again; the initiative must stay, and `updated_at` must not change. Task 2 tests it.
4. **A drop on a filtered roadmap next to the dragged card's own old place.** The index among all cards must be counted without the dragged card, or the card lands one place off. Task 3 tests it.
5. **A draft project that is saved while the user keeps typing.** The route changes from `/projects/new` to `/projects/<id>`; the editor must not load again, so no character and no focus is lost. Task 1 tests it.

---

### Task 1: Projects section, project page, and the table `projects`

After this task, the user can create, rename, describe, delete, and restore projects. Initiatives and meetings do not use them yet.

**Files:**
- Create: `src-tauri/src/projects.rs`
- Modify: `src-tauri/src/db.rs` (migration and test), `src-tauri/src/lib.rs`, `docs/data-model.md`
- Create: `src/lib/projects.ts`, `src/lib/projects.test.ts`
- Create: `src/features/projects/projects-page.tsx`, `src/features/projects/project-page.tsx`, `src/features/projects/project-editor.tsx`, `src/features/projects/project-details-sidebar.tsx`, and a test for the editor
- Modify: `src/App.tsx`, `src/components/app-sidebar.tsx`, `src/components/app-sidebar.browser.test.tsx`, `src/components/use-delete.ts`, `src/components/delete-provider.tsx`, `src/components/delete-provider.test.tsx`

**Interfaces:**
- Produces, Rust (`projects.rs`): `Project { id, name, description, created_at, updated_at, deleted_at: Option<String> }`; `CreateOutcome { Created { project }, NameTaken }`; `RenameOutcome { Renamed { project }, NameTaken }`; `DeleteOutcome { Deleted }` (Task 2 adds `HasInitiatives`); `RestoreOutcome { Restored, NameTaken }`; `Error { NotFound(i64), Unchanged, Database(rusqlite::Error) }`; `list(&Connection, include_deleted: bool) -> Result<Vec<Project>, Error>`, `create(&Connection, name: &str, description: &str) -> Result<CreateOutcome, Error>`, `get(&Connection, id) -> Result<Option<Project>, Error>`, `rename(&Connection, id, name: &str) -> Result<RenameOutcome, Error>`, `update(&Connection, id, description: &str) -> Result<Project, Error>`, `delete(&Connection, id) -> Result<DeleteOutcome, Error>`, `restore(&Connection, id) -> Result<RestoreOutcome, Error>`; `pub(crate) fn project_is_active(&Connection, id) -> Result<bool, Error>` for Task 2.
- Produces, commands: `list_projects`, `create_project`, `get_project`, `rename_project`, `update_project`, `delete_project`, `restore_project`.
- Produces, TypeScript (`src/lib/projects.ts`): `Project`, `CreateProjectResult`, `RenameProjectResult`, `DeleteProjectResult = { status: "deleted" } | { status: "hasInitiatives" }`, `RestoreProjectResult`, `DEFAULT_PROJECT_NAME = "Untitled project"`, `projectDisplayName(name)`, `sortProjects(projects): Project[]` (by shown name, without regard to case), `listProjects({ includeDeleted })`, `createProject({ name, description })`, `getProject(id)`, `renameProject(id, name)`, `updateProject(id, description)`, `deleteProject(id)`, `restoreProject(id)`.
- Produces, `use-delete.ts`: `DeleteKind` adds `"project"`; `class DeleteRefusedError extends Error` whose `message` is the text for the failure toast. `deleteItem` rejects with it when the backend refuses the delete, and pages show `error.message` for it and their own "Couldn't delete …" text for any other error.
- Produces, components: `ProjectDetailsSidebar({ actions, lists })` (an `aside` named "Project details"; Task 4 fills `lists`), `ProjectEditor({ project: Project | null, onCreated: (id: number) => void })`.

- [ ] **Step 1: Write the failing Rust tests** in `projects.rs` against `db::open_in_memory()`: `create_trims_and_saves`, `create_refuses_an_empty_name_and_description` (`Error::Unchanged`), `create_and_rename_return_name_taken_without_regard_to_case`, `empty_names_do_not_conflict`, `a_deleted_project_gives_its_name_free`, `restore_returns_name_taken_when_the_name_is_used`, `list_leaves_out_deleted_projects_unless_asked`, `update_saves_the_description_and_changes_updated_at`, `delete_keeps_the_first_time`, `the_database_refuses_two_active_projects_with_one_name` (a raw `INSERT` with `'checkout'` after `'Checkout'` fails). Add to `db.rs` a test `projects_table_exists_with_its_index` that reads `sqlite_master` for `projects_name` and checks that its SQL contains `COLLATE NOCASE` and `deleted_at IS NULL`.
- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml projects`. Expected: FAIL to compile, because `projects` does not exist.
- [ ] **Step 3: Add the migration** at the end of `MIGRATIONS`: the table `projects` with the columns of ADR 0019, and `CREATE UNIQUE INDEX projects_name ON projects(name COLLATE NOCASE) WHERE deleted_at IS NULL AND name <> ''`. Write `projects.rs` in the style of `initiatives.rs`: `NOW` from `crate::meetings`, an unchecked transaction around check and write in `create`, and `rename` and `restore` that check the name first. Add the seven commands to `lib.rs` and to `generate_handler!`. Add `projects` to the diagram and the tables section of `docs/data-model.md`.
- [ ] **Step 4:** Run `bun run test:rust` and `bun run lint:rust`. Expected: PASS.
- [ ] **Step 5: Write `src/lib/projects.test.ts`** in the style of `src/lib/initiatives.test.ts`: each function calls `invoke` with the command and the camelCase arguments of the spec, `projectDisplayName("  ")` is "Untitled project", and `sortProjects` orders `["checkout", "Billing", "", "Admin"]` as Admin, Billing, checkout, and then the empty name ("Untitled project" sorts by its shown name). Run it, see it fail, write `src/lib/projects.ts`, and run it again to see it pass.
- [ ] **Step 6: Delete provider.** Add the kind `"project"` to `KINDS` in `delete-provider.tsx` with the texts of the Global Constraints. Change `KindActions.remove` to return `Promise<{ refusedText: string } | null>`: `null` for a delete that happened. For a project, `deleteProject` answering `hasInitiatives` gives the text `Couldn't delete "<shown name>" because it still has initiatives.`. The provider then shows no toast and rejects with `DeleteRefusedError`. Add tests to `delete-provider.test.tsx`: a project delete shows `Deleted "Checkout".` and Undo calls `restore_project`; `hasInitiatives` rejects with `DeleteRefusedError` whose message is that text and opens no toast; a `nameTaken` restore shows `Couldn't restore "Checkout" because another project has that name.` with no Undo.
- [ ] **Step 7: Section and routes.** Add `{ title: "Projects", path: "/projects", icon: FolderIcon }` first in `SECTIONS`. Add the routes `/projects` (`ProjectsPage`) and `/projects/:id` (`ProjectPage`) to `App.tsx`; `:id` is `new` for a draft. Update `app-sidebar.browser.test.tsx`, whose Tab order test now reaches "Projects" first.
- [ ] **Step 8: `ProjectsPage`.** Follow `meetings-page.tsx`: the page header with the breadcrumb "Projects" and "New project" (navigates to `/projects/new`), the heading "Projects" with `PAGE_TITLE_CLASSES`, and a list of `sortProjects(await listProjects({ includeDeleted: false }))` that loads again when `useDelete().version` changes. Each row has a link to `/projects/<id>` and the delete button. It shows the loading, error with Retry, and empty states. After a delete, focus moves as on the Meetings page. A restored project gets focus when `restored.kind === "project"`. It reads `location.state` of type `ProjectsPageState = { focusNewProject: true }` to focus "New project". A `DeleteRefusedError` shows its message as a failure toast; any other error shows "Couldn't delete the project. Try again."
- [ ] **Step 9: `ProjectPage` and `ProjectEditor`.** `ProjectPage` reads `:id`. For `new`, it shows `ProjectEditor` with `project={null}`. For a number, it loads with `getProject`, shows "Loading…", "Couldn't load this project" with Retry, and for `null` shows "This project doesn't exist." with a link "Back to Projects". A deleted project loads like any other. When the draft is created, `onCreated(id)` navigates to `/projects/<id>` with `{ replace: true }`. The editor must not remount, so `ProjectPage` keeps the identifier that its draft created and gives the editor the same `key` for `new` and for that identifier, as `InitiativeSheet` does for drafts.

  `ProjectEditor` follows `meeting-editor.tsx` for layout and `initiative-form.tsx` for saving: a draft `{ name, description }` saved with `useAutosave`; the first save of a draft that is not empty after trimming the name calls `createProject`, and on `nameTaken` it keeps the message and creates with an empty name when the description is not empty; later saves call `renameProject` for the name and `updateProject` for the description. The header shows the breadcrumb `[{ label: "Projects", to: "/projects" }, { label: projectDisplayName(savedName) }]` and, once the project is saved, `SaveStatus`. The name field is an `Input` named "Project name" with the placeholder "Untitled project", `aria-invalid` and the message below it while the name is taken, and focus when the editor opens a draft. The description is `MarkdownEditor` with the label "Description". At the right is `ProjectDetailsSidebar` with the "Delete" button (only once saved), which calls `flush()` and then `deleteItem({ kind: "project", id, name: savedName })` and navigates to `/projects` with `{ focusNewProject: true }`. The grid layout is that of `meeting-editor.tsx`.
- [ ] **Step 10: Write `project-editor.test.tsx`** for what the executable specs do not reach: a draft whose name becomes taken and that has a description is created with an empty name; typing continues without a lost character while `createProject` is pending and after the route changes (render `ProjectPage` in a `MemoryRouter` at `/projects/new`, type "Checkout v2" with the create held until after "Checkout", and expect the field to hold "Checkout v2" and to keep focus); Delete saves a waiting change before it deletes. Run, see it fail before the implementation is complete, and pass after.
- [ ] **Step 11:** Run `bun run check`. Expected: only the executable specs listed at the top fail. In `projects.spec.tsx`, the tests about initiatives and the lists still fail.
- [ ] **Step 12: Commit** "Add projects with their own section and page".

### Task 2: Every initiative belongs to a project

After this task, every initiative has a project, the sheet shows it and moves the initiative, and the backend keeps meetings consistent. The meeting sidebar does not show projects yet.

**Files:**
- Modify: `src-tauri/src/db.rs`, `src-tauri/src/initiatives.rs`, `src-tauri/src/meetings.rs`, `src-tauri/src/projects.rs`, `src-tauri/src/lib.rs`, `docs/data-model.md`
- Modify: `src/lib/initiatives.ts`, `src/lib/initiatives.test.ts`, `src/lib/meetings.ts`, `src/lib/meetings.test.ts`, `src/components/delete-provider.tsx` and its test
- Modify: `src/features/initiatives/initiative-form.tsx`, `initiative-form.test.tsx`, `initiative-sheet.tsx`, `initiatives-page.tsx`

**Interfaces:**
- Consumes: `projects::project_is_active`, `Project`, `listProjects`, `sortProjects`, `projectDisplayName`.
- Produces, Rust: `Initiative.project_id: i64` and `InitiativeSummary.project_id: i64`; `initiatives::create(&Connection, project_id: i64, name, description, raci_role)`; `initiatives::set_project(&Connection, id, project_id) -> Result<MoveOutcome, Error>` with `MoveOutcome { Moved { initiative }, NameTaken }`; `RestoreOutcome::ProjectDeleted`; `initiatives::Error::ProjectNotFound(i64)` and `ProjectDeleted(i64)`; `Meeting.project_id: Option<i64>` and `MeetingSummary.project_id: Option<i64>`; `meetings::set_project(&Connection, id, project_id: Option<i64>) -> Result<Meeting, Error>`; `meetings::Error::ProjectNotFound(i64)` and `ProjectDeleted(i64)`; `projects::DeleteOutcome::HasInitiatives`.
- Produces, commands: `set_initiative_project(id, projectId)`, `set_meeting_project(id, projectId)`; `create_initiative` takes `projectId`.
- Produces, TypeScript: `projectId` on `Initiative`, `InitiativeSummary`, `Meeting`, and `MeetingSummary`; `NewInitiative.projectId: number`; `MoveToProjectResult = { status: "moved"; initiative: Initiative } | { status: "nameTaken" }`; `setInitiativeProject(id, projectId)`; `RestoreResult` adds `{ status: "projectDeleted" }`; `setMeetingProject(id, projectId: number | null): Promise<Meeting>`; `InitiativeSheet` gets the prop `draftProjectId: number | null`, the project that a draft starts in.

- [ ] **Step 1: Write the failing migration tests** in `db.rs`, with a constant for the number of migrations before this one: `migration_puts_every_initiative_in_unsorted_and_gives_meetings_their_project` (seed at that version an initiative on the board, a completed one, a deleted one, a meeting assigned to one, and a meeting with none; after `apply`, exactly one project named "Unsorted" exists, all three initiatives refer to it with their old ranks, the assigned meeting has its `project_id`, the other has `NULL`, and foreign keys are on), and `migration_of_an_empty_database_creates_no_project`.
- [ ] **Step 2: Write the failing backend tests.** In `initiatives.rs`: `create_needs_a_project_that_is_not_deleted`, `names_are_unique_within_a_project` (the same name in two projects is allowed, and in one project it is `NameTaken` for create, rename, and restore), `set_project_moves_the_initiative_and_its_meetings` (column, rank, and board order unchanged; `updated_at` of the initiative and the meetings changes), `set_project_returns_name_taken_and_changes_nothing`, `set_project_accepts_the_name_of_a_deleted_initiative`, `set_project_refuses_a_deleted_project`, `restore_returns_project_deleted`, `the_database_refuses_a_second_active_initiative_with_the_same_name_in_one_project`. In `meetings.rs`: `set_initiative_sets_the_project_of_the_initiative`, `set_project_clears_the_initiative_when_it_changes`, `set_project_to_the_same_project_changes_nothing` (initiative and `updated_at` stay), `set_project_refuses_a_deleted_project_but_a_meeting_keeps_one`. In `projects.rs`: `delete_returns_has_initiatives_for_a_project_with_initiatives_that_are_not_deleted` (a completed initiative counts, a deleted one does not). Change the existing tests to the new `create` signature, with a helper that makes a project.
- [ ] **Step 3:** Run `bun run test:rust`. Expected: FAIL to compile.
- [ ] **Step 4: Add the migration** as `M::up_with_hook` or plain SQL, ending with `.foreign_key_check()`. It creates "Unsorted" only when `initiatives` has a row, rebuilds `initiatives` with `project_id INTEGER NOT NULL REFERENCES projects(id)` in the way of `REBUILD_INITIATIVES`, creates `initiatives_name` on `(project_id, name COLLATE NOCASE)` with the old limits, `initiatives_project_id`, and `initiatives_horizon_rank` again, adds `meetings.project_id INTEGER REFERENCES projects(id)` with the index `meetings_project_id`, and sets the `project_id` of each assigned meeting from its initiative. Implement the rules of ADR 0019 in `initiatives.rs`, `meetings.rs`, and `projects.rs`, each change in one transaction. Register the two new commands in `lib.rs`. Update `docs/data-model.md`: the diagram, the relationships, and the column descriptions of all three tables.
- [ ] **Step 5:** Run `bun run test:rust` and `bun run lint:rust`. Expected: PASS.
- [ ] **Step 6: Frontend library.** Extend `src/lib/initiatives.test.ts` and `src/lib/meetings.test.ts` for `createInitiative` with `projectId`, `setInitiativeProject`, and `setMeetingProject`, see them fail, and change the libraries. In `delete-provider.tsx`, a restore of an initiative that answers `projectDeleted` shows `Couldn't restore "<name>" because its project is deleted.` with no Undo; add that test.
- [ ] **Step 7: Write the failing form tests** in `initiative-form.test.tsx`: the "Project" select box comes after "RACI role" with a label "Project"; for a saved initiative it has the projects that are not deleted and no empty choice, and a change calls `set_initiative_project` at once and gives `onSaved` the moved summary; `nameTaken` puts the select box back and shows `Another initiative in "Billing" is named "Launch".`; a failure puts it back and shows "Couldn't move the initiative to the project. Try again."; a draft with `draftProjectId` starts on it, a draft without one starts on the only project when there is exactly one, and otherwise on the empty choice; a draft is created only when it has a project and is not empty; a draft with no projects shows the disabled select box and "Create a project first." with a link "Projects" to `/projects`.
- [ ] **Step 8: Implement the select box.** `InitiativeForm` gets the prop `draftProjectId: number | null` and loads `listProjects({ includeDeleted: false })` once. The draft value that `useAutosave` saves gains `projectId: number | null`; a draft is created only when `projectId !== null && !isEmptyDraft(values)`, with `createInitiative({ ...values, projectId })`. For a saved initiative, the project is not part of the autosaved value: a change calls `setInitiativeProject` at once, and a request that finishes after a newer one does not change the select box, as in `meeting-initiative-select.tsx`. `InitiativeSheet` passes `draftProjectId` through, and `InitiativesPage` passes `null` until Task 3.
- [ ] **Step 9:** Run `bun run check`. Expected: only the executable specs fail; `roadmap.spec.tsx` and `initiative-sheet.spec.tsx` pass again except for the tests about the card's project and the filter.
- [ ] **Step 10: Commit** "Put every initiative in a project".

### Task 3: The project on each card, and the filter of the roadmap

**Files:**
- Modify: `src/features/initiatives/board.ts`, `board.test.ts`, `initiative-card.tsx`, `roadmap-board.tsx`, `roadmap-column.tsx` if it renders cards, `initiatives-page.tsx`, `initiatives-page.test.tsx`

**Interfaces:**
- Consumes: `InitiativeSummary.projectId`, `listProjects`, `sortProjects`, `projectDisplayName`, `InitiativeSheet`'s `draftProjectId`.
- Produces: `filterBoard(board: Board, projectId: number | null): Board` (all cards for `null`); `fullIndex(column: InitiativeSummary[], shown: InitiativeSummary[], id: number, index: number): number`; `RoadmapBoard` gets the prop `projectName: (projectId: number) => string`.

- [ ] **Step 1: Write the failing tests** in `board.test.ts`. `filterBoard` keeps only the cards of the project in every column, in order. `fullIndex` gives the index among the cards of `column` without the card `id`, for a drop at `index` among `shown` without the card: after `shown[index - 1]` when `index > 0`, else before `shown[0]` when it exists, else at the end. Use the cases of `filtered-roadmap.browser.spec.tsx` (for `[C1, B1, C2, B2, C3]` and C3 dropped at 1 the result is 1; for C1 dropped at 1 it is 2; for `[B0, C1, B1, C2, B2, C3]` and C2 dropped at 0 it is 1; for an empty `shown` it is the length of `column` without the card), and one where the dragged card sits between the neighbors of the drop.
- [ ] **Step 2:** Run `bun run test src/features/initiatives/board.test.ts`. Expected: FAIL. Implement both functions, and run again. Expected: PASS.
- [ ] **Step 3: Card.** `CardContent` shows `projectName(initiative.projectId)` in a small muted line directly after the line with the name and before the role pill. `InitiativeCardCopy` shows it too.
- [ ] **Step 4: Page.** `InitiativesPage` loads the projects with the initiatives, and again when `useDelete().version` changes. It keeps `filter: number | null` in its state, shows a `NativeSelect` labeled "Project" with "All projects" (value empty) and `sortProjects` of the projects before "New initiative", and gives `RoadmapBoard` `filterBoard(board, filter)`. `move` turns the index with `fullIndex` for Now, Next, and Later before it calls `moveCard` and `moveInitiative`. `openDraft` gives the sheet `draftProjectId={filter}`. A saved summary whose `projectId` is not the filter disappears through `filterBoard`. Add to `initiatives-page.test.tsx` a test that a move on a filtered board calls `move_initiative` with the index among all cards.
- [ ] **Step 5:** Run `bun run check`, and run `bunx vitest run --project browser src/features/initiatives`. Expected: `filtered-roadmap.browser.spec.tsx` and the roadmap tests of `initiative-project.spec.tsx` pass; other executable specs of this plan may still fail.
- [ ] **Step 6: Commit** "Show the project on each card and filter the roadmap".

### Task 4: The initiatives and meetings of a project

**Files:**
- Create: `src/features/projects/project-initiatives.tsx`, `src/features/projects/project-meetings.tsx`, and their tests
- Modify: `src/features/projects/project-editor.tsx`, `src/features/projects/project-details-sidebar.tsx`

**Interfaces:**
- Consumes: `ProjectDetailsSidebar({ actions, lists })`, `InitiativeSheet` with `draftProjectId`, `listInitiatives`, `buildBoard`, `COLUMNS`, `listMeetings`, `MeetingSummary.projectId`, `formatMeetingDate`, `displayName`.
- Produces: `ProjectInitiatives({ projectId: number | null })` and `ProjectMeetings({ projectId: number | null })`; `null` is a draft, which shows the empty text and a disabled "New initiative".

- [ ] **Step 1: Write the failing tests** for both components. `ProjectInitiatives` shows the rows in the order of `buildBoard`: Now, Next, Later, then Done; each row is a `li` with a button that shows `initiativeDisplayName(name)` and the column title; the section is a region named by its heading "Initiatives"; a row opens `InitiativeSheet` for that initiative; "New initiative" opens a draft with `draftProjectId` of this project; a saved summary replaces its row, and a summary with another `projectId` removes it; a delete removes the row, and the list loads again when `useDelete().version` changes. `ProjectMeetings` lists the meetings with this `projectId`, newest first, as the Meetings page does, each row a `li` with a link to `/meetings/<id>` that shows the name and `formatMeetingDate(date)`, in a region named "Meetings"; "No meetings" when empty.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement both,** and give them to `ProjectDetailsSidebar` as `lists`. The sidebar puts the two regions in rows sized `minmax(0,1fr)` that each scroll with `min-h-0 overflow-y-auto`, as ADR 0005 describes. `ProjectInitiatives` deletes through `useDelete().deleteItem({ kind: "initiative", … })` and shows "Couldn't delete the initiative. Try again." on failure, as `InitiativesPage` does.
- [ ] **Step 4:** Run `bun run check`. Expected: `projects.spec.tsx` and `project-page.spec.tsx` pass; only `meeting-project.spec.tsx` may still fail.
- [ ] **Step 5: Commit** "Show the initiatives and meetings of a project on its page".

### Task 5: The project of a meeting

**Files:**
- Create: `src/features/meetings/meeting-project-select.tsx` and its test
- Modify: `src/features/meetings/meeting-editor.tsx`, `meeting-initiative-select.tsx`, `meeting-initiative-select.test.tsx`, `meeting-editor-page.test.tsx`, `src/lib/initiatives.ts`, `src/lib/initiatives.test.ts`

**Interfaces:**
- Consumes: `setMeetingProject`, `listProjects`, `sortProjects`, `projectDisplayName`, `Meeting.projectId`.
- Produces: `MeetingProjectSelect({ meetingId: number, projectId: number | null, onSaved: (meeting: Meeting) => void })`; `MeetingInitiativeSelect` gets the prop `projectId: number | null`; `initiativeChoiceGroups(all, projectId)` and `deletedInitiativeChoices(all, projectId)` keep only the initiatives of `projectId`, and none for `null`.

- [ ] **Step 1: Write the failing tests.** In `initiatives.test.ts`, both choice functions leave out initiatives of other projects and return nothing for `null`. In `meeting-project-select.test.tsx`: the row has the label "Project" and the select box "Meeting project" with an empty choice and `sortProjects` of the projects that are not deleted; a deleted project of the meeting is the last choice until another value is saved; a change calls `set_meeting_project` at once and gives `onSaved` the stored meeting; a failure puts it back and shows "Couldn't change the project. Try again."; the choices load again when `useDelete().version` changes. In `meeting-initiative-select.test.tsx`: with `projectId={null}` the select box has only the empty choice and is disabled.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** `MeetingProjectSelect` follows `meeting-initiative-select.tsx`, including its handling of requests that finish out of order. `MeetingEditor` keeps `assignment: { projectId, initiativeId }` from the meeting in its state, shows `MeetingProjectSelect` between the Date row and `MeetingInitiativeSelect`, and sets both values from the meeting that `onSaved` gives. It gives `MeetingInitiativeSelect` `key={assignment.projectId ?? "none"}`, `projectId`, and `initiativeId`, so the select box starts over after a project change. `MeetingInitiativeSelect` is disabled while `projectId` is `null`.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS, including every executable spec.
- [ ] **Step 5: Commit** "Choose the project of a meeting in its sidebar".

### Task 6: Verification

- [ ] **Step 1:** Run `bun run check`. Expected: every check passes, with the counts of Vitest and Rust tests noted for the pull request.
- [ ] **Step 2:** Write the checks by hand for the pull request, for a human to run with `bun run tauri dev` against a copy of a database from `main` with initiatives and assigned meetings: the roadmap shows "Unsorted" on every card, a meeting keeps its initiative and shows "Unsorted", and moving an initiative to a new project moves the meeting too.
- [ ] **Step 3:** Update the pull request description with the summary, the design links, the verification counts, and the checks by hand. Convert it from draft to ready for review.
