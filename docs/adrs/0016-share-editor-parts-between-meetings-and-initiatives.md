# 16. Share the editor parts of meetings with initiatives

Date: 2026-09-26

## Status

Accepted

## Context

Feature ticket 0006 adds initiatives, which are edited in a sheet over a roadmap (ADR 0015). The sheet needs several parts that the meeting editor already has:

- the Markdown editor with its formatting toolbar, its link popover, and its link shortcut (`NotesEditor`, `link-popover.tsx`, `link-shortcut.ts`),
- the hook that saves automatically while the user types (`useAutosave`),
- the save status with its "Retry" button (`SaveStatus`),
- the provider that archives an item, shows the archive toast with "Undo", and restores the item (`ArchiveProvider` and `useArchive`).

All of these live in `src/features/meetings/`, and some of them use the word "meeting" in their names, types, and messages. Some are simple, such as the save status. Others took many rounds of review to get right, such as the archive provider, which handles a restore that finishes after a later archive has replaced its toast.

A first attempt at this feature, which was not merged, showed that these parts can be shared without changing how meetings behave.

## Decision

We move these parts out of `src/features/meetings/`, give them names that do not say "meeting", and use them from both features.

- `NotesEditor` becomes `MarkdownEditor`, in `src/components/markdown-editor/`, together with its link popover and link shortcut. It gets a `label` prop for the accessible name of its text area, such as "Notes" or "Description". Its behavior does not change.
- `useAutosave` moves to `src/hooks/use-autosave.ts`, and `SaveStatus` moves to `src/components/save-status.tsx`. They do not change.
- `ArchiveProvider` and `useArchive` move to `src/components/` and learn a second kind of item. The caller of `archive` gives the kind (`"meeting"` or `"initiative"`), the identifier, and the name. The kind selects:
  - the backend commands (`archive_meeting` and `unarchive_meeting`, or `archive_initiative` and `unarchive_initiative`),
  - the name for an empty name ("Untitled meeting" or "Untitled initiative"),
  - the text of the toast (`Archived "<name>".` or `Deleted "<name>".`),
  - the text when a restore fails ("Couldn't restore the meeting. Try again." or "Couldn't restore the initiative. Try again.").

  A restore of an initiative can also answer that another initiative has its name (ADR 0013). Then the toast says `Couldn't restore "<name>" because another initiative has that name.` and has no "Undo" button, because trying again cannot succeed. A restore of a meeting never gives this answer.

  There is still at most one archive toast. Deleting an initiative closes an open archive toast for a meeting, and the other way around. `restored` gives the kind with the identifier, so that a page reacts only to a restore of its own kind. `version` counts the archives and restores of both kinds. A page that shows a list loads it again after any archive or restore, which costs one extra load when the other kind changed.
- The shadcn native select component is added as `src/components/ui/native-select.tsx`, for the "RACI role" select box and the initiative select box in the meeting sidebar. A native select box works with the keyboard and with screen readers without extra code, and supports groups of choices.

The meeting pages must keep their exact behavior. Their feature specs do not change, and they must pass after each move. Unit tests of the moved parts move with them.

## Consequences

- The sheet gets the tested editor, saving, and archive toast without a second copy of the code. A fix in one place fixes both kinds.
- A third kind of item, such as a task later, adds one entry to the archive provider's kinds.
- `src/features/meetings/` becomes smaller. It keeps the parts that belong only to meetings: the date, the action items, the details sidebar, and the new initiative select box.
- The moves change many import paths. Each move is a separate step, with all tests passing after it, so that a problem can be found quickly.

## Alternatives considered

- **Copy the parts into `src/features/initiatives/`** and change the words. This is fast, but the most difficult code would exist twice, and the two copies would drift apart when one of them is fixed.
- **A second provider for the delete toast of initiatives.** It would duplicate the provider, and two toasts with "Undo" could be open at the same time, which ADR 0009 does not intend.
- **Share the meeting details sidebar and the list with archive buttons too.** The first attempt did this, but the roadmap has no list page and the sheet has no sidebar, so nothing would use the shared versions.
