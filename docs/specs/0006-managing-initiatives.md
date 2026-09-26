# Spec 0006: Managing initiatives

Ticket: [0006 Managing initiatives](../features/0006-managing-initiatives.md)

Executable specs: `src/features/initiatives/initiatives.spec.tsx`, `src/features/initiatives/initiatives.browser.spec.tsx`, and `src/features/meetings/meeting-initiative.spec.tsx`

## Summary

The user records the company initiatives that they have a responsibility in. Each initiative has a name, a description, and the user's role in it, which is one of the four roles of the RACI model. Initiatives have their own section in the application, with a page that lists them and an editor page for each one. The editor page works like the editor page of a meeting: the description is written in the same editor as the notes of a meeting, and changes are saved automatically. The user can archive an initiative and undo the archive, as for a meeting. On the editor page of a meeting, the user assigns the meeting to an initiative with a select box in the meeting details sidebar.

See [ADR 0013](../adrs/0013-store-initiatives-and-link-meetings-to-them.md) for how initiatives are stored, and [ADR 0014](../adrs/0014-share-editor-and-list-building-blocks.md) for the parts that the initiative pages share with the meeting pages.

## Terms

- **Initiative**: a larger piece of company work that the user has a responsibility in, such as a product launch. It has a name, a description, and a role.
- **Role**: the user's responsibility in an initiative, in the RACI model. It is one of "Responsible", "Accountable", "Consulted", and "Informed", or no role.
- **Initiatives page**: the page that lists the initiatives that are not archived.
- **Initiative editor page**: the page that shows one initiative and lets the user change it.
- **Initiative details sidebar**: the column at the right side of the initiative editor page. It is a landmark named "Initiative details".
- **Assign**: to record that a meeting is about an initiative. A meeting is assigned to at most one initiative.

The terms "meeting", "Meetings page", "editor page", and "notes editor" are defined in [Spec 0001](0001-take-meeting-notes.md). The terms "archive", "restore", and "archive toast" are defined in [Spec 0004](0004-archive-meeting-notes.md). The terms "meeting details sidebar" and "failure toast" are defined in [Spec 0005](0005-meeting-action-items.md). In this spec, "editor page" alone means the editor page of a meeting.

## Behavior

### Section

- The sidebar of the application has a link named "Initiatives", below the link named "Meetings". It shows a target icon, and its tooltip says "Initiatives".
- The link opens the Initiatives page. While the Initiatives page or an initiative editor page is open, the "Initiatives" link is marked as the current page.
- The application still opens on the Meetings page.

### Initiatives page

- The page header shows the breadcrumb "Initiatives" and a button named "New initiative". Below the header is the title "Initiatives".
- The page lists the initiatives that are not archived, the initiative that was created last at the top.
- Each initiative in the list is a link that opens its editor page. The link shows the name of the initiative. For an initiative with an empty name, it shows "Untitled initiative". When the initiative has a role, the link also shows the role, such as "Responsible", in muted text at the right side of the row.
- When there are no initiatives, the page says "No initiatives yet".
- While the list loads, the page says "Loading…". If it cannot be loaded, the page says "Couldn't load initiatives" and shows a "Retry" button that loads it again.
- When the list is taller than the window, only the list scrolls. The page header and the title stay in place.

### Creating an initiative

- When the user clicks "New initiative", a new initiative is created and its editor page opens. The new initiative has the name "Untitled initiative", an empty description, and no role.
- The "Initiative name" field has keyboard focus, and its text is selected, so the user can type the name at once.
- While the initiative is being created, the "New initiative" button is disabled.
- If the initiative cannot be created, the Initiatives page stays open, the button is enabled again, and a failure toast says "Couldn't create the initiative. Try again."

### Initiative editor page

- The page has two columns, like the editor page of a meeting. The left column has the page header, the name, the formatting toolbar, and the description. The initiative details sidebar is at the right side, from the top to the bottom of the main area. It has the same width as the meeting details sidebar.
- The page header shows the breadcrumb "Initiatives > <name>", where "Initiatives" is a link to the Initiatives page, and the save status. For an empty name, the breadcrumb shows "Untitled initiative".
- The name is in a text field named "Initiative name". When it is empty, it shows "Untitled initiative" as a placeholder.
- The description is in an editor named "Description", with the same formatting toolbar and the same formatting as the notes editor. It is stored as Markdown.
- From top to bottom, the initiative details sidebar shows:
  1. a row with the label "Role" and a select box named "RACI role",
  2. the "Archive" button.
- The "RACI role" select box has these choices, in this order: an empty choice, which means no role, then "Responsible", "Accountable", "Consulted", and "Informed". For an initiative with no role, the empty choice is selected.
- When the description is taller than the space it has, only the description scrolls. The page header, the name, the formatting toolbar, and the sidebar stay in place.
- Changes to the name, the description, and the role are saved automatically after the user pauses for about half a second, and the save status shows "Saving…", "Saved", or "Couldn't save" with a "Retry" button, as for a meeting. If the user leaves the page before the pause ends, the change is saved at once.
- The name, the description, and the role are kept when the user leaves the page and opens it again, and after the application is closed and opened again.
- While the initiative loads, the page says "Loading…". If no initiative has the identifier, the page says "This initiative doesn't exist." with a link "Back to Initiatives". If the initiative cannot be loaded, the page says "Couldn't load this initiative" and shows a "Retry" button.

### Archiving an initiative

Archiving an initiative works like archiving a meeting, as described in [Spec 0004](0004-archive-meeting-notes.md) and changed by [Spec 0005](0005-meeting-action-items.md), with these words:

- On the Initiatives page, each row has a button named `Archive "<name>"`, which is visible only when the pointer is over the row or the button has keyboard focus. After an archive, keyboard focus moves to the archive button of the next initiative, or of the one before it if the archived initiative was the last one, or to the "New initiative" button if the list is now empty.
- In the initiative details sidebar, the "Archive" button archives the initiative, opens the Initiatives page, and moves keyboard focus to the "New initiative" button. A change that was not yet saved is saved.
- The archive toast says `Archived "<name>".` and has an "Undo" button that restores the initiative. After a restore, if the Initiatives page is open, the initiative appears in its place in the list again, and keyboard focus moves to its link.
- If the initiative cannot be archived, it stays in the list, or its editor page stays open, and a failure toast says "Couldn't archive the initiative. Try again."
- If the initiative cannot be restored, the text of the archive toast changes to "Couldn't restore the initiative. Try again.", and its "Undo" button tries again.
- There is only one archive toast, for meetings and initiatives together. When the user archives an initiative while the archive toast for a meeting is open, that toast closes and a toast for the initiative appears, and the other way around.
- An archived initiative does not appear in the list of initiatives. Archiving an initiative does not change its name, description, role, or the time it was last changed, and it does not change the meetings that are assigned to it.

### Assigning a meeting to an initiative

- The meeting details sidebar has a row with the label "Initiative" and a select box named "Meeting initiative", below the "Date" row and above the "Archive" button.
- The select box has these choices, in this order:
  1. an empty choice, which means that the meeting is not assigned,
  2. the initiatives that are not archived, in the order of the Initiatives page, each shown by its name,
  3. the archived initiatives, in alphabetical order of their names without regard to uppercase and lowercase letters, each shown as `<name> (archived)`, such as `Launch (archived)`.

  For an initiative with an empty name, the name is "Untitled initiative".
- The choice that is selected is the initiative that the meeting is assigned to, or the empty choice if it is not assigned.
- When the user chooses an initiative, the meeting is assigned to it and the assignment is saved at once. When the user chooses the empty choice, the assignment is removed. The save status of the editor page does not change.
- If the assignment cannot be saved, the select box shows the choice that was saved last again, and a failure toast says "Couldn't assign the initiative. Try again." When a later assignment succeeds, the failure toast closes.
- While the initiatives load, the select box is disabled. If they cannot be loaded, the row says "Couldn't load initiatives" and shows a "Retry" button that loads them again. The rest of the editor page works as usual.
- The assignment is kept when the user leaves the editor page and opens it again, and after the application is closed and opened again.

## Changes to earlier specs

Merged specs are not changed. This spec changes them as follows:

- [Spec 0003](0003-compact-section-nav.md): the sidebar of the application has two sections, Meetings and Initiatives.
- [Spec 0005](0005-meeting-action-items.md): the meeting details sidebar shows, from top to bottom, the "Date" row, the "Initiative" row, the "Archive" button, a separator, and the action items panel.

## Not checked by the executable specs

- That the archive button of a row is hidden until the pointer is over the row. Check it by hand with `bun run tauri dev`.
- That initiatives, their roles, and the assignments of meetings are kept after the application is closed and opened again, that an unknown role is refused, and that archiving an initiative does not change its meetings. These depend on the real database. The Rust tests of `src-tauri/src/initiatives.rs` and `src-tauri/src/meetings.rs` check them.

## Backend contract

The executable specs replace the Tauri backend with an in-memory fake. They rely on the commands of Specs 0001, 0004, and 0005, with this change and these additions, which the real backend must provide:

| Command                  | Arguments                               | Result                                                          |
| ------------------------ | --------------------------------------- | --------------------------------------------------------------- |
| `list_initiatives`       | `includeArchived`                       | list of summaries of initiatives, the newest first              |
| `create_initiative`      | none                                    | the new initiative                                              |
| `get_initiative`         | `id`                                    | the initiative, or `null` if no initiative has the identifier   |
| `update_initiative`      | `id`, `name`, `description`, `raciRole` | the initiative after the change                                 |
| `archive_initiative`     | `id`                                    | nothing (`null`)                                                |
| `unarchive_initiative`   | `id`                                    | nothing (`null`)                                                |
| `set_meeting_initiative` | `id`, `initiativeId`                    | the meeting after the change                                    |

- An initiative has the fields `id`, `name`, `description`, `raciRole`, `createdAt`, `updatedAt`, and `archivedAt`. A summary has the fields `id`, `name`, `raciRole`, `updatedAt`, and `archivedAt`.
- `raciRole` is `"responsible"`, `"accountable"`, `"consulted"`, `"informed"`, or `null`.
- `list_initiatives` with `includeArchived: false` returns only the initiatives that are not archived. With `includeArchived: true`, it returns all of them. Both are sorted by the time of creation, the newest first.
- `create_initiative` creates an initiative with the name "Untitled initiative", an empty description, and no role.
- `update_initiative` replaces the name, the description, and the role, and changes `updatedAt`.
- `archive_initiative` and `unarchive_initiative` work like `archive_meeting` and `unarchive_meeting`.
- A meeting has the new field `initiativeId`, a number or `null`. `set_meeting_initiative` sets it. `initiativeId: null` removes the assignment. The command changes the meeting's `updatedAt`. `update_meeting` does not change `initiativeId`.
- All commands reject with a message when no initiative or meeting has the identifier, when the role is not one of the four values, or when the database reports an error.

## Out of scope

- A list of the meetings of an initiative, on the initiative editor page or elsewhere.
- Assigning a meeting to more than one initiative.
- A page or filter that shows archived initiatives, apart from the select box of a meeting.
- Deleting initiatives permanently.
- Objectives and key results (OKRs), and a link from an initiative to them.
- Assigning action items to an initiative.
