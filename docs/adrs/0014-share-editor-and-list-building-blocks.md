# 14. Share the building blocks of the meeting pages with the initiative pages

Date: 2026-09-26

## Status

Accepted

## Context

Feature ticket 0006 adds two pages for initiatives: a page that lists them, and an editor page for one initiative. These pages work like the two pages for meetings:

- The list page has a button that creates a new item, a list of links to the items that are not archived, and an "Archive" button on each row. After an archive, keyboard focus moves to a neighboring row. The archive toast has an "Undo" button, and after a restore, focus moves to the restored row.
- The editor page has a name field, a Markdown editor with a formatting toolbar, a save status in the page header, and a sidebar at the right with properties and an "Archive" button (ADR 0011). Changes are saved automatically.

The code for these parts lives in `src/features/meetings/` and uses the word "meeting" in its names, types, and messages. Some parts are simple, such as the save status. Others took many rounds of review to get right, such as the code that decides where focus goes after an archive when several archives happen quickly, and the provider that owns the archive toast and its "Undo" button (`ArchiveProvider`).

The user asked us to reuse these parts where it is appropriate. We had to decide whether to copy them into `src/features/initiatives/` or to share them, and how to share the archive toast.

## Decision

We move the parts that do not depend on meetings out of `src/features/meetings/`, and give them names that do not say "meeting". The meetings pages then use the shared parts, and the initiatives pages use them too.

- The notes editor becomes `MarkdownEditor`, in `src/components/markdown-editor/`, together with its link popover and its link shortcut. It gets a prop for the accessible name of its text area, such as "Notes" or "Description". Its behavior does not change.
- `useAutosave` moves to `src/hooks/use-autosave.ts`, and `SaveStatus` moves to `src/components/save-status.tsx`. They do not change.
- `MeetingDetailsSidebar` becomes `DetailsSidebar`, in `src/components/details-sidebar.tsx`. It gets a prop for the accessible name of its landmark, such as "Meeting details" or "Initiative details". Its part for lists becomes optional, because an initiative has no lists yet. When that part is left out, the separator is left out too.
- The code of the Meetings page that shows a row with a link and an "Archive" button, and that moves focus after an archive and after a restore, becomes a shared list component in `src/components/`. The page gives it the items, the path and the name of each item, the text at the right side of each row, the archive action, and the button that gets focus when the list becomes empty.
- `ArchiveProvider` and `useArchive` move to `src/components/` and learn a second kind of item. The caller of `archive` gives the kind (`"meeting"` or `"initiative"`), the identifier, and the name. The kind selects:
  - the backend commands (`archive_meeting` and `unarchive_meeting`, or `archive_initiative` and `unarchive_initiative`),
  - the name to show for an empty name ("Untitled meeting" or "Untitled initiative"),
  - the message when a restore fails ("Couldn't restore the meeting. Try again." or "Couldn't restore the initiative. Try again.").

  The toast text is `Archived "<name>".` for both kinds. There is still at most one archive toast: archiving an initiative closes an archive toast for a meeting, and the other way around. `restored` gives the kind with the identifier, so that a page reacts only to a restore of its own kind. `version` counts the archives and restores of both kinds. A list page loads its list again after any archive or restore, which costs one extra load when the other kind changed.

The meetings pages must keep their exact behavior. Their feature specs do not change, and they must pass after each move. Unit tests of the moved parts move with them.

## Consequences

- The initiatives pages get the tested focus behavior and the archive toast without a second copy of the code. A fix in one place fixes both kinds.
- The shared list component and the archive provider have a small set of kinds. A third kind of item, such as a task page later, adds one entry to each.
- `src/features/meetings/` becomes smaller. The meeting editor keeps the parts that belong only to meetings: the date, the action items, and the new select box of initiatives.
- The moves change many import paths in one branch. Each move is a separate step, with all tests passing after it, so that a problem can be found quickly.

## Alternatives considered

- Copy the meeting parts into `src/features/initiatives/` and change the words. This is fast, but the most difficult code would exist twice and the two copies would drift apart when one of them is fixed.
- A second provider only for the archive toast of initiatives. It would duplicate the provider, and two archive toasts, one for each kind, could be open at the same time, which ADR 0009 does not intend.
- One generic editor page for every item that has a name, Markdown, and a sidebar, configured for each kind. The two editor pages already have different sidebars and different ways to save, so the configuration would be as large as the pages themselves.
