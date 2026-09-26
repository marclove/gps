# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`gps` is a Tauri 2 desktop application with a React 19 + TypeScript frontend (built with Vite) and a Rust backend in `src-tauri`.

## Commands

Package manager is Bun (`bun.lock` is the lockfile; use `bun`, not `npm`/`yarn`/`pnpm`).

- `bun install` — install frontend dependencies
- `bun run dev` — start the Vite dev server alone (frontend only, port 1420)
- `bun run tauri dev` — run the full desktop app (spawns the Vite dev server and the Rust/Tauri shell)
- `bun run build` — type-check (`tsc`) and build the frontend to `dist/`
- `bun run tauri build` — produce a release build/bundle of the desktop app
- `bun run preview` — preview the built frontend

### Linting, formatting, and tests

- `bun run check` — runs every check below in sequence; run this before committing. CI (`.github/workflows/check.yml`) runs the same command on Ubuntu for pushes to `main` and all pull requests.
- `bun run typecheck` — `tsc --noEmit` against `tsconfig.json` (strict mode; test files are included)
- `bun run lint` / `bun run lint:fix` — ESLint (flat config in `eslint.config.js`: `@eslint/js` recommended, `typescript-eslint` recommended, `react-hooks`, `react-refresh`)
- `bun run fmt` / `bun run fmt:check` — Prettier for all `.ts` and `.tsx` files, indented with 4 spaces (config in `.prettierrc.json`). Run `bun run fmt` after editing TypeScript; `bun run check` fails on unformatted files
- `bun run test` — Vitest, single run; `bun run test:watch` for watch mode; `bun run test:coverage` for v8 coverage in `coverage/`
- `bun run lint:rust` — `cargo clippy --all-targets -- -D warnings`; lint levels are set in `src-tauri/Cargo.toml` under `[lints]` (`clippy::all` and `clippy::pedantic` at warn, `unsafe_code` forbidden), so any warning fails the run
- `bun run fmt:rust` / `bun run fmt:rust:check` — rustfmt (config in `src-tauri/rustfmt.toml`)
- `bun run test:rust` — `cargo test` for the backend

Running a single test:

- TypeScript: `bun run test src/App.test.tsx` or `bunx vitest run -t "opens on the Meetings page"`
- Rust: `cargo test --manifest-path src-tauri/Cargo.toml <test name>`

### Testing conventions

- Frontend tests live next to the code as `*.test.tsx` / `*.test.ts` under `src/`, run in jsdom with React Testing Library. `src/test/setup.ts` registers jest-dom matchers and runs `cleanup()` after each test.
- Tauri is not available in jsdom, so mock `@tauri-apps/api/core` (see `src/lib/meetings.test.ts`). Use `vi.hoisted` for the mock function so it is available before the module is imported.
- Rust unit tests go in a `#[cfg(test)] mod tests` block in the same file as the code under test.
- `src/test/setup.ts` also stubs browser APIs that jsdom does not implement, such as `window.matchMedia`, which the sidebar uses, and `Range.getClientRects`, `Range.getBoundingClientRect`, and `document.elementFromPoint`, which the TipTap notes editor uses. When a component fails in tests because jsdom lacks a browser API, add a minimal stub there with a comment that says which component needs it.
- Behavior that depends on layout, such as scrolling or positions on the screen, cannot be tested in jsdom. Test it in a browser feature spec named `*.browser.spec.tsx` or a browser unit test named `*.browser.test.tsx`, which the `browser` Vitest project runs in headless WebKit at 1200 by 800 pixels with the application's CSS (`src/test/browser-setup.ts`). Use `userEvent` from `vitest/browser`, which sends real input through Playwright. Mock `@tauri-apps/api/core` as in jsdom tests. Keep everything else in jsdom tests, which are faster. Install the browser once with `bunx playwright install webkit`. Run only one project with `bunx vitest run --project unit` or `--project browser`. Coverage covers only the `unit` project.
- To type into the TipTap editor after a toolbar click in a test, use `user.keyboard`, because `user.type` clicks the element first and moves the cursor.

## Architecture

- **Frontend** (`src/`): standard Vite + React entry point (`main.tsx` → `App.tsx`). Communicates with the Rust backend via `@tauri-apps/api`'s `invoke()`, calling commands registered in Rust.
- **Shell and routing**: `App.tsx` wraps every page in the application shell, which is a narrow sidebar that shows each section as an icon and cannot be hidden (`src/components/app-sidebar.tsx`, see ADR 0007), and a main area. Each page renders `PageHeader` (`src/components/page-header.tsx`) first, with its breadcrumb trail. The shell is exactly as tall as the window, and the window never scrolls. Each page fills the main area, lays out its areas with CSS grid, and decides which areas scroll: a scrolling area is a grid cell with `min-h-0` and `overflow-y-auto`, in a row sized `minmax(0,1fr)` (see ADR 0005). Routing uses React Router with a `MemoryRouter`, because a desktop window has no address bar; the application always starts at `/`. The sidebar is for navigation between sections only. Each section gets one item in `SECTIONS` in `app-sidebar.tsx`, with a title, a path, and an icon, and its routes in `App.tsx`. Feature code lives in `src/features/<feature>/`. The window uses the standard macOS title bar, which is the only area that moves the window. Its color is the window's `backgroundColor` in `tauri.conf.json` (with `titleBarStyle: "Transparent"`), which must stay equal to `--sidebar-border` in `src/index.css`; a browser spec checks this.
- **UI components**: styling uses Tailwind CSS v4 through the `@tailwindcss/vite` plugin, with the theme defined as CSS variables in `src/index.css`. Components come from shadcn (configuration in `components.json`). Add a component with `bunx --bun shadcn@latest add <component>`; it is copied into `src/components/ui/`, where it can be edited like any other project code. Run `bun run fmt` afterward, because generated components are not formatted to the project style. Generated code must pass our lint rules too. If it does not, fix the generated file rather than turning off the rule (for example, `src/hooks/use-mobile.ts` was rewritten to use `useSyncExternalStore`). Use the `cn` helper from `@/lib/utils` to combine class names. The `@/` import alias maps to `src/` and is configured in both `tsconfig.json` and `vite.config.ts`. ESLint's fast refresh rule is turned off for `src/components/ui/`, because shadcn components export variant helpers alongside the component.
- **Backend** (`src-tauri/src/`): `main.rs` is the binary entry point and simply calls `gps_lib::run()` defined in `lib.rs`. `lib.rs` builds the `tauri::Builder`, registers plugins, and exposes commands via `#[tauri::command]` + `invoke_handler(tauri::generate_handler![...])`. New backend commands must be added to both the function definitions and the `generate_handler!` list in `lib.rs`.
- **Database**: the backend owns a SQLite database (`rusqlite` with bundled SQLite), stored as `gps.sqlite` in the application data directory. `db.rs` opens it at startup and applies the migrations in `MIGRATIONS`; add new migrations to the end of that list and never change a released one. `docs/data-model.md` holds a Mermaid entity relationship diagram (ERD) of the database. Whenever a change adds, removes, or changes a table, a column, or a relationship, update the ERD and its column descriptions in the same change. Each kind of data has its own module with all of its SQL, starting with `meetings.rs`; its functions take a `&Connection` and are tested against `db::open_in_memory()`. The command functions in `lib.rs` stay thin: they call `Database::run` with a module function. Commands take `State` by value, so each has `#[expect(clippy::needless_pass_by_value)]`. On the frontend, `src/lib/meetings.ts` holds the TypeScript types and the only `invoke` calls for meetings.
- **Tauri configuration** (`src-tauri/tauri.conf.json`): defines window settings, dev/build commands (which invoke the Bun scripts above), and bundle targets. The frontend dev server must stay on port 1420 (`vite.config.ts` enforces `strictPort`) since Tauri's `devUrl` depends on it.
- **Capabilities/permissions** (`src-tauri/capabilities/default.json`): Tauri 2's permission system. Any new Tauri plugin or restricted API used from the frontend needs its permission added here (currently `core:default` and `opener:default`).
- **IPC contract**: frontend and backend are decoupled processes; all communication goes through Tauri's `invoke` (JS → Rust command) and event system. There is no shared type layer, so keep argument/return shapes in sync manually between the `#[tauri::command]` signatures and the frontend call sites.

## Development Process

### Features

For new features, we always follow this process:

1. Ticket: Every feature starts from a ticket that a human has written in a new, numbered file in `docs/features`, such as `docs/features/0007-export-route.md`. Tickets follow the "jobs to be done" (JTBD) style: they describe the user problem, not the solution. Tickets are **always** written by humans and never by agents. An agent begins this process only when a human assigns it a ticket. If the ticket is ambiguous or incomplete, ask the human to clarify rather than guessing.
2. Branch checkout: Use the naming convention `feat/terse-name-of-the-feature`. Push the branch and open a draft PR on GitHub right away, so that every later commit, including design documents, is visible for review.
3. Exploration and design: Use the `superpowers:brainstorming` skill to investigate potential ways to solve the problem and make decisions regarding user experience and architecture. Do not save a separate design document. Instead, record the outcome as ADRs (step 4) and feature specs (step 5).
4. Architecture decisions: Capture any notable architecture decisions in an ADR in `docs/adrs`, using the next available number, such as `docs/adrs/0003-store-routes-in-sqlite.md`.
5. Specification: Write black box feature specs that describe the expected behavior from the user's perspective. Each spec has two parts:
   - A written description in `docs/specs`, numbered to match the ticket, such as `docs/specs/0007-export-route.md`.
   - An executable test in a `*.spec.tsx` file under `src/`, which Vitest picks up alongside the unit tests. The `.spec` suffix separates feature specs from `*.test.tsx` unit tests. These specs drive the app through its user interface with React Testing Library and mock the Tauri backend, because there is no end-to-end harness for the real desktop app yet. Adopting one would require its own ADR.

   The executable specs must fail before proceeding to the next step to ensure they are meaningful.
6. Human approval of the design: Stop and ask a human to review the ADRs and specs before planning. Do not continue until they approve.
7. Planning: Use the `superpowers:writing-plans` skill to write a step-by-step implementation plan in `docs/plans`, numbered to match the ticket, such as `docs/plans/0007-export-route.md`. Each step is a releasable, vertical slice of new behavior of the system. The feature specs are not expected to pass until all steps are completed, but all other tests must pass before advancing from step to step.
8. Human approval of the plan: Stop and ask a human to review the plan. Do not begin implementation until they approve.
9. Implementation: Use the `superpowers:subagent-driven-development` skill to implement the plan task by task. Push each commit to the draft PR.
10. Verification: Run `bun run check` and ensure the full suite passes, including the new feature specs.
11. Convert the draft PR to an open PR and wait for human review.

### Chores

A chore is a task that is not a feature, a bug fix, or a refactor. Examples include updating dependencies, changing CI or tooling configuration, editing documentation, and adjusting project settings. Trivial code changes that need no design, such as fixing a typo in a string or a comment, also count as chores.

For chores:

1. Complete the task without using any of the `superpowers` skills.
2. If the requested change seems significant, explain why you think it is so that we can agree on scope. If we agree that it is significant, suggest a planning session before beginning on the changes, or handle it as a feature, bug fix, or refactor instead.
3. Work on a branch named `chore/terse-name-of-the-chore`, never directly on `main`.
4. Run `bun run check` and ensure it passes before committing. Skipping the `superpowers` skills does not mean skipping verification.
5. Push the branch, open a PR on GitHub, and wait for human review.

### Bug Fixes

For bug fixes, we always follow this process:

1. Report: A human describes the bug, either directly in the conversation or in a GitHub issue. The report should state what the user expected, what actually happened, and how to reproduce it. If any of these are missing or unclear, ask before proceeding.
2. Branch checkout: Use the naming convention `fix/terse-name-of-the-bug`
3. Investigation: Use the `superpowers:systematic-debugging` skill to find the root cause. Do not propose or apply a fix until the root cause is understood and explained. Fixing a symptom without understanding the cause is not acceptable.
4. Reproduction: Write a failing regression test that reproduces the bug at the lowest level that can demonstrate it. Confirm that the test fails for the reason you expect before changing any production code.
5. Fix: Use the `superpowers:test-driven-development` skill to make the smallest change that makes the regression test pass. Do not include unrelated cleanups or refactors in the same branch; note them for a separate task instead.
6. If the root cause reveals a flaw in an existing architecture decision, stop and discuss it with a human. A change of that size may need a superseding ADR, or may need to be handled as a feature or refactor instead.
7. Ensure the full test suite is passing (`bun run check`), commit, and push to a draft PR on GitHub. The PR description must explain the root cause, the fix, and how the regression test covers it.
8. Convert the draft PR to an open PR and wait for human review.

### Refactors

A refactor changes the structure of the code without changing its behavior. For refactors, we always follow this process:

1. Branch checkout: Use the naming convention `refactor/terse-name-of-the-refactor`
2. Baseline: Confirm the full test suite passes before making any changes. If coverage of the code to be refactored is weak, first add tests that pin down its current behavior, and commit them separately before the refactor begins.
3. Scope: If the refactor is small and local (for example, renaming, extracting a function, or reorganizing a single module), proceed directly. If it touches multiple modules, changes the IPC contract between the frontend and backend, or alters architecture, use the `superpowers:brainstorming` skill to agree on the approach, capture notable decisions in an ADR in `docs/adrs`, and use the `superpowers:writing-plans` skill to break the work into steps.
4. Implementation: Make changes in small steps. The full test suite must pass after every step. For a planned refactor, use the `superpowers:subagent-driven-development` skill to implement the plan task by task.
5. Tests: Existing tests must not be changed to accommodate the refactor unless they depend on internal details that the refactor intentionally changes. When a test is changed, explain why in the commit message. Black box feature specs, both the descriptions in `docs/specs` and the executable `*.spec.tsx` files, must never need to change during a refactor; if one does, the change is not a refactor.
6. Commit each step and push to a draft PR on GitHub. The PR description must state the motivation for the refactor and confirm that no behavior changed.
7. Convert the draft PR to an open PR and wait for human review.

### Rules

- An agent must never modify any files in `docs/features`. These are immutable, read-only files.
- An agent must never modify an ADR in `docs/adrs` once the ADR has been merged into main. Changes to existing architecture are captured in a superseding ADR.
- An agent must never modify a spec file in `docs/specs` once the file has been merged into main.
- An agent must never modify a plan file in `docs/plans` once the file has been merged into main.
- Never reference sections of an ADR or plan in docstrings or code comments. This makes code documentation brittle.
- Never put files in a `superpowers` subdirectory. Use the existing `docs` directory structure.
- Never implement a feature, or any part of it, before a human approves its plan. During design and planning, a spike may only answer a specific open question, such as whether a library works in the test environment. Write the smallest code that answers the question, keep it in a throwaway location outside the branch, never commit it, and stop as soon as the question is answered. If checking the plan seems to need more than that, ask a human first.

### Guidelines

- All ADRs and plan files must be written in plainspoken English that is contextually atomic and understandable to an engineer who has just joined the team. They should not assume the reader has any existing knowledge of project jargon or invariants. Important concepts are described in accessible language rather than abbreviated through jargon or shorthand.
- All public items should be documented with docstrings that use the ASD-STE100 writing standard.
