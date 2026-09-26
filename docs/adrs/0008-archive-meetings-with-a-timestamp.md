# 8. Archive meetings by recording when they were archived

Date: 2026-09-26

## Status

Accepted

## Context

A user can create a meeting by mistake, for example by clicking "New note" when they meant to open an existing meeting. Such a meeting then stays in the list of meetings, which makes the list harder to use. The feature ticket asks for a way to archive a meeting so that it no longer appears in the list.

To archive a meeting means to hide it, not to destroy it. The user can reverse the action at once with an "Undo" button. The application does not yet have a page that shows archived meetings, but a later feature could add one, so the archived meetings and their notes must stay in the database.

The meetings are stored in the `meetings` table of the SQLite database that the Rust backend owns (see ADR 0003). The frontend gets the list of meetings from the backend command `list_meetings`, and reads and saves one meeting with `get_meeting` and `update_meeting`.

We had to decide how the database marks a meeting as archived, which part of the application hides archived meetings, and how the frontend asks for a meeting to be archived or restored.

## Decision

- A new migration adds a column `archived_at` of type `TEXT` to the `meetings` table. The column is empty (`NULL`) for a meeting that is not archived. For an archived meeting, it holds the time when the meeting was archived, as an RFC 3339 timestamp in UTC, in the same format as `created_at` and `updated_at`. Existing meetings get `NULL`, so they stay in the list.
- The backend hides archived meetings. `list_meetings` returns only the meetings whose `archived_at` is `NULL`. The frontend does not filter the list.
- Two new backend commands change the column:
  - `archive_meeting` takes the identifier of a meeting and sets `archived_at` to the current time. If the meeting is already archived, the command keeps the time that is already stored.
  - `unarchive_meeting` takes the identifier of a meeting and sets `archived_at` back to `NULL`.

  Both commands return nothing when they succeed, and fail with a "not found" error when no meeting has the identifier.
- Archiving and restoring do not change `updated_at`. That column records when the user last changed the name, date, or notes, and archiving does not change any of them.
- `get_meeting` and `update_meeting` work for archived meetings in the same way as for other meetings. When the user archives a meeting from its editor page, the editor closes and saves any change that is still waiting to be saved. That save happens after the meeting is archived, so it must succeed.
- The `Meeting` and `MeetingSummary` types that the commands return do not get a new field, because no part of the user interface shows whether a meeting is archived.

## Consequences

- A meeting that was archived by mistake can be restored without loss, because nothing is deleted.
- Every query that lists meetings must remember to leave out archived meetings. Today `list_meetings` is the only such query. Keeping all SQL for meetings in `src-tauri/src/meetings.rs` makes future queries easy to check.
- Archived meetings stay in the database file and keep using space. For text notes, the amount of space is small.
- A later feature can add a page of archived meetings, sorted by the time they were archived, without another change to the table.
- The frontend and the fake backend in the feature specs must implement the two new commands in the same way as the Rust backend.

## Alternatives considered

- A column `archived` of type `INTEGER` that holds 0 or 1. It is equally simple, but it does not record when a meeting was archived, which a page of archived meetings would probably need.
- A separate table for archived meetings. Archiving would copy the row to that table and delete it from `meetings`, and restoring would copy it back. This requires more SQL, and every change to the structure of a meeting would have to be made in two tables.
- Deleting the meeting. The ticket asks for archiving, and a deletion cannot be undone once the application has closed.
- A single command `set_meeting_archived` with a true or false argument. Two named commands describe the two user actions more clearly, which matches the other commands.
