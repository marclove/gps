# Spec 0008: Projects

Ticket: [0008 Projects](../features/0008-projects.md)

Executable specs: `src/features/projects/projects.spec.tsx`, `src/features/projects/project-page.spec.tsx`, `src/features/initiatives/initiative-project.spec.tsx`, `src/features/initiatives/filtered-roadmap.browser.spec.tsx`, and `src/features/meetings/meeting-project.spec.tsx`. The earlier specs `src/features/initiatives/roadmap.spec.tsx`, `src/features/initiatives/initiative-sheet.spec.tsx`, `src/features/initiatives/roadmap.browser.spec.tsx`, and `src/features/meetings/meeting-initiative.spec.tsx` now check the behavior of Specs 0006 and 0007 with the changes that this spec describes under "Changes to earlier specs".

## Summary

The user records the projects of the company that they work on. Each project has a name, a description, and a page that shows the project's initiatives and the meetings about it. Every initiative belongs to one project, and the user can move it to another one. A meeting is about one project or about no project. The roadmap stays one board, shows the project on each card, and can be filtered to one project.

See [ADR 0019](../adrs/0019-store-projects-and-place-each-initiative-in-one.md) for how projects are stored and the rules that keep meetings, initiatives, and projects consistent, and [ADR 0020](../adrs/0020-show-projects-on-pages-and-filter-the-roadmap.md) for the pages and the filter.

## Terms

- **Project**: a long lived effort of the company, such as a product area. It has a name and a description.
- **Projects page**: the page that lists the projects.
- **Project page**: the page of one project.
- **Draft**: a new project, or a new initiative, that is not saved yet.
- **Same name**: two names are the same when they are equal after removing spaces at the start and the end, without regard to uppercase and lowercase letters, as in [Spec 0006](0006-managing-initiatives.md).
- **Filter**: the choice of one project in the "Project" select box of the Initiatives page.

The terms "meeting", "Meetings page", and "editor page" are defined in [Spec 0001](0001-take-meeting-notes.md). The terms "meeting details sidebar" and "failure toast" are defined in [Spec 0005](0005-meeting-action-items.md). The terms "initiative", "roadmap", "card", "sheet", and "assign" are defined in Spec 0006. The terms "delete", "restore", and "delete toast" are defined in [Spec 0007](0007-deleted-rows-and-ranked-order.md).

## Behavior

### Section

- The sidebar of the application has a link named "Projects" above the link named "Meetings". It shows a folder icon, and its tooltip says "Projects".
- The link opens the Projects page. While the Projects page or a project page is open, the "Projects" link is marked as the current page.
- The application still opens on the Meetings page.

### Projects page

- The page header shows the breadcrumb "Projects" and a button named "New project". Below the header is the heading "Projects".
- The page lists the projects that are not deleted, sorted by the shown name without regard to case. Each project is a link that shows its name, or "Untitled project" when the name is empty. The link opens the project page.
- An empty list says "No projects yet". While the projects load, the page says "Loading…". If they cannot be loaded, it says "Couldn't load projects" with a "Retry" button.
- Each row has a button with a trash can icon, named `Delete "<name>"`. It deletes the project as described under "Deleting a project".

### Creating a project

- "New project" opens the project page for a draft. The draft has an empty name and an empty description. The "Project name" field has keyboard focus. Nothing is saved.
- The draft page has no "Delete" button and no save status. Its lists say "No initiatives" and "No meetings", and its "New initiative" button is disabled.
- The draft is saved as a project after the user types a name that is not empty after removing the spaces at its start and end, or any text in the description. The change is saved after the user pauses, or at once when the user leaves the page.
- When the draft is saved, the page shows the save status and the "Delete" button, and "New initiative" is enabled. What the user typed stays in the fields. The new project appears on the Projects page.
- If the user leaves the draft without such a change, nothing is saved.

### The project page

- The page header shows the breadcrumb "Projects", which links to the Projects page, followed by the name of the project, or "Untitled project". The save status is at the right of the header.
- At the left are the "Project name" field and the description in the Markdown editor with its toolbar, labeled "Description".
- At the right is a sidebar named "Project details". From top to bottom, it shows the "Delete" button, the list "Initiatives" with a "New initiative" button, and the list "Meetings". Each list is a region named after its heading.
- Changes to the name and the description are saved automatically, as on the meeting editor page. The save status says "Saving…", "Saved", or "Couldn't save" with a "Retry" button.
- A project that does not exist shows "This project doesn't exist." with a link named "Back to Projects" that opens the Projects page.

### Unique project names

- Two projects that are not deleted cannot have the same name. Any number of projects can have an empty name.
- When the user types the name of another project, the name field is marked as invalid, and a message below it says `Another project is named "<name>".` The saved name does not change, and the breadcrumb keeps it. The description is still saved. The save status does not say "Couldn't save".
- The message goes away when the user changes the name to one that can be saved.
- A deleted project gives its name free.

### The initiatives and meetings of a project

- The list "Initiatives" shows the initiatives of the project that are not deleted, in the order of the roadmap: the initiatives in Now, then Next, then Later, each in the order of its column, then the completed initiatives, the one completed last first. Each row is a button that shows the name of the initiative, or "Untitled initiative", and its column: "Now", "Next", "Later", or "Done".
- Clicking a row opens the sheet of that initiative over the project page. The sheet works as on the roadmap. After a change in the sheet, the list shows the new name. When the initiative moves to another project, or is deleted, it leaves the list. "Undo" in the delete toast brings it back.
- "New initiative" opens the sheet for a draft whose project is this project. When the draft is saved, it appears in the list.
- An empty list says "No initiatives".
- The list "Meetings" shows the meetings about the project that are not deleted, with the newest date first, and each meeting's date. Each row is a link that opens the editor page of the meeting. An empty list says "No meetings".

### Deleting a project

- "Delete" on the project page and the delete button of a row on the Projects page delete the project. Changes that were waiting on the project page are saved first.
- After a delete from the project page, the Projects page opens, and the "New project" button has keyboard focus.
- The delete toast says `Deleted "<name>".` with an "Undo" button. "Undo" restores the project. If the Projects page is open, the project appears in the list again.
- If another project that is not deleted has the same name by then, the project stays deleted, and the toast says `Couldn't restore "<name>" because another project has that name.` with no "Undo" button.
- A project that still has initiatives that are not deleted, including completed ones, is not deleted. A failure toast says `Couldn't delete "<name>" because it still has initiatives.` The project stays in the list and its page stays open.
- If a project cannot be deleted for another reason, a failure toast says "Couldn't delete the project. Try again."
- The meetings of a deleted project keep their project, as described under "The project of a meeting".

### The project of an initiative

- Every initiative belongs to one project.
- The sheet of an initiative has a select box labeled "Project", after the "RACI role" select box. Its choices are the projects that are not deleted, by the shown name without regard to case.
- For a saved initiative, the select box shows its project and has no empty choice. Choosing another project moves the initiative there at once. The meetings that are assigned to the initiative move to that project too. The card stays in its place on the roadmap.
- If the other project already has an initiative with the same name that is not deleted, the initiative does not move. The select box goes back to the project that is saved, and a message below it says `Another initiative in "<project>" is named "<name>".`
- If the move cannot be saved, the select box goes back and a failure toast says "Couldn't move the initiative to the project. Try again."
- The name of an initiative is unique within its project. Two projects can each have an initiative named "Launch". The message about a name that is taken, from Spec 0006, applies only to initiatives of the same project.
- If "Undo" restores an initiative whose project was deleted in the meantime, the initiative stays deleted, and the toast says `Couldn't restore "<name>" because its project is deleted.` with no "Undo" button.

### Creating an initiative

The rules of Spec 0006 for drafts still apply, with these changes:

- The draft sheet shows the "Project" select box with an empty choice. It starts on:
  - the project of the filter, when the roadmap is filtered,
  - the project of the project page, when the draft opens from a project page,
  - otherwise, the only project, when exactly one project exists,
  - otherwise, the empty choice.
- The draft is saved only when it has a project, and also a name, a role, or text in the description. Choosing a project alone does not save the draft.
- While the draft has a name, a role, or text in the description, but no project, clicking "Save" keeps the sheet open and moves the focus to the "Project" select box. When no project exists, the focus goes to the "Projects" link instead, and when the projects cannot be loaded, to the "Retry" button. When projects exist, the select box is also marked as invalid, and a message below it, which describes it, says "Choose a project to save this initiative." The close button, Escape, and a click outside the sheet still close the sheet, and the draft is not saved.
- When no project exists, the select box is disabled, and a text below it says "Create a project first." with a link named "Projects" that opens the Projects page.

### The roadmap

- Each card shows the name of its project, or "Untitled project", below the name of the initiative. The accessible name of the card starts with the name of the initiative.
- The page header has a select box labeled "Project", before the "New initiative" button. Its choices are "All projects", then the projects that are not deleted, by the shown name without regard to case. It starts on "All projects".
- When the user chooses a project, the roadmap shows only the cards of that project. The count in each column heading counts only these cards, and a column without such cards says "No initiatives". Choosing "All projects" shows every card again.
- The filter goes back to "All projects" when the user leaves the page.
- Dragging works as in Spec 0006 while the roadmap is filtered, and the announcements count only the shown cards. A card dropped into Now, Next, or Later lands:
  - directly after the shown card above the place of the drop, if there is one,
  - otherwise, directly before the shown card below the place of the drop, if there is one,
  - otherwise, at the end of the column.

  The cards of other projects do not move. On the unfiltered roadmap, the dropped card is between the same cards as on the filtered one.
- When an initiative moves to another project while the roadmap is filtered, its card leaves the roadmap.

### The project of a meeting

- The meeting details sidebar shows a "Project" row between the "Date" row and the "Initiative" row. Its select box is labeled "Meeting project".
- The choices are an empty choice, which means no project, and the projects that are not deleted, by the shown name without regard to case.
- When the user chooses a project, it is saved at once. If it cannot be saved, the select box goes back to the saved choice, and a failure toast says "Couldn't change the project. Try again."
- If the meeting is about a deleted project, that project is the last choice, and it is selected. It disappears from the choices after the user chooses another one.
- The "Initiative" select box offers only the initiatives of the meeting's project, grouped as in Spec 0006. When the meeting has no project, the select box has only the empty choice and is disabled.
- When the user changes the project of a meeting, its initiative is cleared, and the "Initiative" select box shows the empty choice and the initiatives of the new project.
- A meeting that is assigned to an initiative is about the project of that initiative.

## Changes to earlier specs

Merged specs are not changed. This spec changes them as follows:

- [Spec 0003](0003-compact-section-nav.md) and [Spec 0006](0006-managing-initiatives.md): the sections in the sidebar are, from the top, "Projects", "Meetings", and "Initiatives".
- Spec 0006: a draft initiative needs a project, as described under "Creating an initiative". The sheet shows, from the top: the name field with the save status, the "RACI role" and "Project" select boxes, the completion date of a completed initiative, the toolbar and the description, and the "Delete" and "Save" buttons.
- Spec 0006: names of initiatives are unique within a project, instead of across all initiatives.
- Spec 0006: each card also shows the name of its project.
- Spec 0006: the select box of a meeting's initiative offers only the initiatives of the meeting's project, and is disabled when the meeting has no project.
- [Spec 0005](0005-meeting-action-items.md), Spec 0006, and [Spec 0007](0007-deleted-rows-and-ranked-order.md): the meeting details sidebar shows, from top to bottom, the "Date" row, the "Project" row, the "Initiative" row, the "Delete" button, a separator, and the action items panel.

## Not checked by the executable specs

- The migration: that every existing initiative is in a project named "Unsorted", that an empty database gets no project, and that each assigned meeting gets the project of its initiative. The unit tests of the migration in `src-tauri/src/db.rs` check this.
- That the database refuses two projects with the same name, and two initiatives with the same name in one project. The unit tests in `src-tauri/src/projects.rs` and `src-tauri/src/initiatives.rs` check this.
- That the real backend moves the meetings of an initiative with the initiative, clears the initiative of a meeting whose project changes, and sets the project of a meeting from its initiative. The unit tests in `src-tauri/src/initiatives.rs` and `src-tauri/src/meetings.rs` check this. The fake backend of the executable specs does the same, and the specs check what the user sees.

## Backend contract

The executable specs replace the Tauri backend with an in-memory fake. They rely on the commands of the earlier specs, with the changes below, which the real backend must provide. Arguments and results use camelCase names.

A project has `id`, `name`, `description`, `createdAt`, `updatedAt`, and `deletedAt`.

| Command                  | Arguments                   | Result                                                                                           |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `list_projects`          | `includeDeleted`            | the projects that are not deleted, or all of them when `includeDeleted` is `true`, in any order |
| `create_project`         | `name`, `description`       | `{ status: "created", project }` or `{ status: "nameTaken" }`                                     |
| `get_project`            | `id`                        | the project, also a deleted one, or `null`                                                       |
| `rename_project`         | `id`, `name`                | `{ status: "renamed", project }` or `{ status: "nameTaken" }`                                     |
| `update_project`         | `id`, `description`         | the project                                                                                      |
| `delete_project`         | `id`                        | `{ status: "deleted" }` or `{ status: "hasInitiatives" }`                                        |
| `restore_project`        | `id`                        | `{ status: "restored" }` or `{ status: "nameTaken" }`                                            |
| `set_initiative_project` | `id`, `projectId`           | `{ status: "moved", initiative }` or `{ status: "nameTaken" }`                                   |
| `set_meeting_project`    | `id`, `projectId` or `null` | the meeting                                                                                      |

- `create_project` and `rename_project` remove the spaces at the start and the end of the name. They answer `nameTaken` when another project that is not deleted has the same name. `create_project` rejects a project whose name and description are both empty.
- `delete_project` answers `hasInitiatives` and changes nothing when the project has an initiative that is not deleted.
- `set_initiative_project` answers `nameTaken` and changes nothing when an initiative of the other project that is not deleted has the same name. Otherwise it changes the project of the initiative and of every meeting that is assigned to it.
- `set_meeting_project` clears `initiativeId` when the project changes.

The existing commands change as follows:

- An initiative and its summary have `projectId`. A meeting and its summary have `projectId`, which is `null` for a meeting about no project.
- `create_initiative` takes `projectId`, in addition to `name`, `description`, and `raciRole`.
- `rename_initiative`, `create_initiative`, and `restore_initiative` answer `nameTaken` only for an initiative of the same project.
- `restore_initiative` answers `{ status: "projectDeleted" }` and changes nothing when the project of the initiative is deleted.
- `set_meeting_initiative` with an initiative also sets `projectId` of the meeting to the project of the initiative.

## Out of scope

- Several initiatives for one meeting (`meeting_initiatives` in the target data model).
- Stakeholders of a project, and tasks that belong to a project.
- A page of deleted projects, and restoring a project after its delete toast has closed.
- Remembering the filter of the roadmap after the user leaves the page.
