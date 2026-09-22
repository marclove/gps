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

Rust side (run from `src-tauri/`):
- `cargo check` — type-check the Rust backend
- `cargo build` — build the Rust backend

There is no test suite or linter configured yet.

## Architecture

- **Frontend** (`src/`): standard Vite + React entry point (`main.tsx` → `App.tsx`). Communicates with the Rust backend via `@tauri-apps/api`'s `invoke()`, calling commands registered in Rust.
- **Backend** (`src-tauri/src/`): `main.rs` is the binary entry point and simply calls `gps_lib::run()` defined in `lib.rs`. `lib.rs` builds the `tauri::Builder`, registers plugins, and exposes commands via `#[tauri::command]` + `invoke_handler(tauri::generate_handler![...])`. New backend commands must be added to both the function definitions and the `generate_handler!` list in `lib.rs`.
- **Tauri configuration** (`src-tauri/tauri.conf.json`): defines window settings, dev/build commands (which invoke the Bun scripts above), and bundle targets. The frontend dev server must stay on port 1420 (`vite.config.ts` enforces `strictPort`) since Tauri's `devUrl` depends on it.
- **Capabilities/permissions** (`src-tauri/capabilities/default.json`): Tauri 2's permission system. Any new Tauri plugin or restricted API used from the frontend needs its permission added here (currently `core:default` and `opener:default`).
- **IPC contract**: frontend and backend are decoupled processes; all communication goes through Tauri's `invoke` (JS → Rust command) and event system. There is no shared type layer, so keep argument/return shapes in sync manually between the `#[tauri::command]` signatures and the frontend call sites.
