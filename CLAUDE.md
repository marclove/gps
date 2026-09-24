# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`gps` is a Tauri 2 desktop application with a React 19 + TypeScript frontend (built with Vite) and a Rust backend in `src-tauri`. The repository currently contains the unmodified Tauri + React + TypeScript starter template.

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
- `bun run test` — Vitest, single run; `bun run test:watch` for watch mode; `bun run test:coverage` for v8 coverage in `coverage/`
- `bun run lint:rust` — `cargo clippy --all-targets -- -D warnings`; lint levels are set in `src-tauri/Cargo.toml` under `[lints]` (`clippy::all` and `clippy::pedantic` at warn, `unsafe_code` forbidden), so any warning fails the run
- `bun run fmt:rust` / `bun run fmt:rust:check` — rustfmt (config in `src-tauri/rustfmt.toml`)
- `bun run test:rust` — `cargo test` for the backend

Running a single test:

- TypeScript: `bun run test src/App.test.tsx` or `bunx vitest run -t "invokes the greet command"`
- Rust: `cargo test --manifest-path src-tauri/Cargo.toml greet_includes_name`

### Testing conventions

- Frontend tests live next to the code as `*.test.tsx` / `*.test.ts` under `src/`, run in jsdom with React Testing Library. `src/test/setup.ts` registers jest-dom matchers and runs `cleanup()` after each test.
- Tauri is not available in jsdom, so mock `@tauri-apps/api/core` (see `src/App.test.tsx`). Use `vi.hoisted` for the mock function so it is available before the module is imported.
- Rust unit tests go in a `#[cfg(test)] mod tests` block in the same file as the code under test.

## Architecture

- **Frontend** (`src/`): standard Vite + React entry point (`main.tsx` → `App.tsx`). Communicates with the Rust backend via `@tauri-apps/api`'s `invoke()`, calling commands registered in Rust.
- **Backend** (`src-tauri/src/`): `main.rs` is the binary entry point and simply calls `gps_lib::run()` defined in `lib.rs`. `lib.rs` builds the `tauri::Builder`, registers plugins, and exposes commands via `#[tauri::command]` + `invoke_handler(tauri::generate_handler![...])`. New backend commands must be added to both the function definitions and the `generate_handler!` list in `lib.rs`.
- **Tauri configuration** (`src-tauri/tauri.conf.json`): defines window settings, dev/build commands (which invoke the Bun scripts above), and bundle targets. The frontend dev server must stay on port 1420 (`vite.config.ts` enforces `strictPort`) since Tauri's `devUrl` depends on it.
- **Capabilities/permissions** (`src-tauri/capabilities/default.json`): Tauri 2's permission system. Any new Tauri plugin or restricted API used from the frontend needs its permission added here (currently `core:default` and `opener:default`).
- **IPC contract**: frontend and backend are decoupled processes; all communication goes through Tauri's `invoke` (JS → Rust command) and event system. There is no shared type layer, so keep argument/return shapes in sync manually between the `#[tauri::command]` signatures and the frontend call sites.

## Development Process

For new features, we always follow this process:

1. Scoping and definition: Determine what user problem is to be solved. Define it in a new, numbered file, kept in `docs/features`. The definition should follow the "jobs to be done" (JTBD) ticket style. Tickets are **always** written by humans and never by agents. Agents **must** treat the `docs/features` directory as read-only. A human will hand off the process to an agent by assigning it one of these tickets.
2. Branch checkout: Use the naming convention `feat/terse-name-of-the-feature`
3. Exploration and design: Use the `superpowers:brainstorming` skill to investigate potential ways to solve the problem and make decisions regarding user experience and architecture.
4. Capture any notable architecture decisions in an ADR in `docs/adrs`.
5. Specification: Write black box feature spec(s) that describe the expected behavior from the user's perspective. The feature spec(s) must fail before proceeding to the next step to ensure they are meaningful.
6. Planning: Use the `superpowers:writing-plans` skill to write step-by-step implementation plans, where each step is a releasable, vertical slice of new behavior of the system. The black box feature specs are not expected to pass until all steps are completed, but all other tests must pass before advancing from step to step.
7. Implementation: Use the `superpowers:subagent-driven-development` skill to implement the plan task-by-task. Each commit you make should also be pushed to a draft PR on Github.
8. Ensure the full test suite is passing, including the new feature spec(s).
9. Convert the draft PR to an open PR and wait for human review.

### Rules

- An agent must never modify any files in `docs/features`. These are immutable, read-only files.
- An agent must never modify an ADR in `docs/adrs` once the ADR has been merged into main. Changes to existing architecture are captured in a superceeding ADR.
- An agent must never modify an spec file in `docs/specs` once the file has been merged into main.
- An agent must never modify a plan file in `docs/plans` once the file has been merged into main.
- Never reference sections of an ADR or plan in docstrings or code comments. This makes code documentation brittle.
- Never put files in a `superpowers` subdirectory. Use the existing `docs` directory structure.

### Guidelines

- All ADRs and plan files must be written in plainspoken English that is contextually atomic and understandable to an engineer who has just joined the team. They should not assume the reader has any existing knowledge of project jargon or invariants. Important concepts are described in accessible language rather than abbreviated through jargon or shorthand.
- All public items, should be documented with docstrings that use the ASD-STE100 writing standard.
