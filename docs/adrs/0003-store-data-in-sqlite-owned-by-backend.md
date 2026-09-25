# 3. Store data in SQLite, owned by the Rust backend

Date: 2026-09-24

## Status

Accepted

## Context

The application must save meeting notes so that they are still there after it is closed and opened again. The feature ticket asks for the data to be kept in a SQLite database file in the application data directory. The application data directory is a folder that the operating system gives each application for its own files, such as `~/Library/Application Support/<app identifier>` on macOS. Tauri reports its location through `app.path().app_data_dir()`.

This application has two processes. The frontend is a React application that runs inside a web view. The backend is a Rust program. The frontend cannot open files itself. It asks the backend to do work by calling named "commands" through Tauri's `invoke` function. We had to decide which process owns the database and how the other process gets to the data.

## Decision

The Rust backend owns the database.

- The backend uses the `rusqlite` crate with its `bundled` feature. The `bundled` feature compiles a known version of SQLite into the application, so the application does not depend on the version of SQLite installed on the computer.
- At startup, the backend creates the application data directory if it does not exist, and opens or creates the file `gps.sqlite` in it. The open connection is kept in Tauri's managed state inside a `Mutex`, so that one command at a time uses it.
- Changes to the database structure are written as numbered migrations. A migration is a step that changes the structure, such as creating a table. The `rusqlite_migration` crate applies the migrations that have not yet been applied, in order, at startup and before the window loads.
- The frontend does not send SQL. The backend exposes one command for each operation that the application needs, such as `list_meetings` or `update_meeting`. Each command has typed arguments and a typed result.
- The code that runs SQL lives in its own module for each kind of data, starting with `src-tauri/src/meetings.rs`. The functions in this module take a database connection as an argument. The command functions in `lib.rs` are thin: they lock the connection and call the module.
- On the frontend, one module for each kind of data, starting with `src/lib/meetings.ts`, contains the TypeScript types and the only calls to `invoke` for those commands. The rest of the frontend imports from that module.
- Timestamps are stored as text in the RFC 3339 format in UTC, such as `2026-09-24T17:03:12.456Z`, and are set by SQLite. Calendar dates without a time, such as the date of a meeting, are stored as text in the `YYYY-MM-DD` format. Both formats sort correctly as text and are easy to read.

## Consequences

- The web view cannot run arbitrary SQL. No new Tauri permissions are needed, because the application's own commands are allowed by default.
- The data logic is tested in Rust against a database that exists only in memory, with the real migrations applied. These tests are fast and do not touch the user's files.
- Frontend tests replace `invoke` with a fake that implements the same commands. The list of commands is short and describes what the application does, which keeps those fakes simple.
- The argument and result shapes are written twice, once in Rust and once in TypeScript, and must be kept in step by hand. Keeping all calls for a kind of data in one frontend module limits the places that can drift.
- A single connection behind a lock is enough for one window and a small amount of data. If the application later needs parallel database work, the connection handling can change without changing the commands.

## Alternatives considered

- The official Tauri SQL plugin, `tauri-plugin-sql`. The frontend would write SQL and run it through the plugin. There would be less Rust code, but the web view would have general access to the database, the query logic would be in TypeScript where it is hard to test without the real plugin, and frontend tests would have to fake a SQL interface instead of a few named operations.
- The `sqlx` crate in the backend. The design would be the same as the one we chose, but with asynchronous queries that are checked at compile time. Those checks need a database while compiling, or saved query information in the repository, which adds work to local builds and to continuous integration. For a small number of simple queries, that cost is not justified.
