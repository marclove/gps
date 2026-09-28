# 20. Show projects on their own pages, and filter the roadmap by project

Date: 2026-09-28

## Status

Accepted

## Context

Feature ticket 0008 adds projects, which ADR 0019 stores. The user wants to see everything they have recorded about a project in one place, to filter the roadmap to one project, and to choose the project of a meeting in its sidebar.

The application today has two sections in its narrow sidebar (ADR 0007): Meetings and Initiatives.

- A meeting is edited on its own page, `/meetings/:id`. The page has the name and the notes at the left, and a "Meeting details" sidebar at the right with the date, the initiative, a "Delete" button, and the action items (ADR 0011). A new meeting is saved as soon as the user clicks "New note".
- An initiative is edited in a sheet over the roadmap (ADR 0015). "New initiative" opens a draft, which is saved only after the user changes it, so that an abandoned click leaves nothing behind.
- The shared delete provider deletes an item, shows the delete toast with "Undo", and restores the item. It knows two kinds of items, meetings and initiatives (ADR 0016, ADR 0017).

We had to decide:

- where projects appear in the navigation, and how the list and the page of a project look,
- how a new project is created,
- how the user opens an initiative and a meeting from the project page,
- how an initiative gets its project, and how the user moves it,
- how the roadmap shows and filters projects, and where a card goes when it is dragged while the roadmap is filtered,
- how the meeting sidebar chooses a project,
- how the delete provider handles projects and the new answers of ADR 0019.

## Decision

### Navigation and the list of projects

- The sidebar gets a "Projects" section with a folder icon. It is the first section, above "Meetings", because a project contains initiatives and meetings. The application still opens on the Meetings page.
- The routes are `/projects` for the list, `/projects/new` for a draft, and `/projects/:id` for a project.
- The list works like the list of meetings: a page header with the breadcrumb "Projects" and a "New project" button, a heading, and one row for each project that is not deleted. The rows are sorted by the shown name without regard to case. Each row is a link to the project page, and has a button with a trash can icon, named `Delete "<name>"`, that shows when the pointer is over the row or the button has keyboard focus. An empty list says "No projects yet".

### The project page

The project page has the layout of the meeting editor page:

- The page header shows the breadcrumb "Projects" and the name of the project, and the save status.
- At the left, the name field, labeled "Project name", with the placeholder "Untitled project", and below it the Markdown editor with its toolbar, labeled "Description" (ADR 0016). The description scrolls in its own area.
- At the right, a sidebar labeled "Project details". From top to bottom, it has the "Delete" button, a separator, the list of initiatives, and the list of meetings. The two lists share the height that is left, and each scrolls in its own area.

The name and the description are saved automatically with `useAutosave`, with the same delay as the meeting editor. The name is saved with `rename_project` and the description with `update_project`, as the sheet of an initiative does (ADR 0015). When another project has the name, the name field is marked as invalid, and a message below it says `Another project is named "<name>".` The name stays as it was saved last.

**The list of initiatives** has the heading "Initiatives" and a button "New initiative". It shows the initiatives of the project that are not deleted, in the order of the roadmap: Now, Next, and Later, each by rank, then the completed initiatives with the one completed last first. Each row is a button that shows the name and the column, such as "Now" or "Done". A click opens the sheet of the initiative over the project page. This is the same `InitiativeSheet` as on the roadmap, so the user edits an initiative in one way everywhere. "New initiative" opens the sheet for a draft whose project is this project. When the sheet saves, moves, or deletes an initiative, the list changes to match. An empty list says "No initiatives".

**The list of meetings** has the heading "Meetings". It shows the meetings about the project that are not deleted, with the newest date first, in the same way as the Meetings page. Each row is a link to the meeting editor page. The breadcrumb of the meeting editor page does not change. An empty list says "No meetings".

### Drafts of projects

"New project" does not save anything. It opens the page at `/projects/new` for a draft, with an empty name and an empty description, and the name field has keyboard focus. The draft is saved with `create_project` only after the user types a name that is not empty after removing the spaces at its start and end, or any text in the description. This is the rule of ADR 0015 for initiatives, and the user chose it for the same reason.

- When the draft is saved, the route becomes `/projects/<id>` and replaces `/projects/new` in the history. The editor does not load again, so the text that the user types is not lost. From then on, the page saves as for any other project.
- The draft page has no "Delete" button, no save status, and empty lists. "New initiative" is disabled until the draft is saved, because an initiative needs a saved project.
- If the name of the draft is taken, the message about the name shows. If the draft has a description, it is saved with an empty name.
- If the user leaves an untouched draft, nothing is saved.

### The project of an initiative

The sheet of an initiative gets a select box labeled "Project", next to the "RACI role" select box. Its choices are the projects that are not deleted, sorted by the shown name without regard to case.

- For a saved initiative, the select box has no empty choice. A change calls `set_initiative_project` at once, not after a pause, because it is one choice, like the initiative of a meeting. If the answer is `nameTaken`, the select box goes back to the saved project, and a message below it says `Another initiative in "<project>" is named "<name>".` If the move fails, the select box goes back and a failure toast says "Couldn't move the initiative to the project. Try again."
- For a draft, the select box has an empty choice. It starts on the project of the roadmap filter or of the project page that opened the draft. Otherwise, it starts on the only project when there is exactly one, and on the empty choice when there are more. A draft is saved only when it has a project and also a name, a role, or a description. A change of the project alone does not save the draft.
- When no project exists, the select box is disabled, and a text below it says "Create a project first." with a link to the Projects page.

### The roadmap

- Each card shows the name of its project in a small muted line below the name of the initiative. The accessible name of the card still starts with the name of the initiative.
- The page header has a select box labeled "Project", before the "New initiative" button, with the choices "All projects" and each project that is not deleted. "All projects" is the first value.
- When a project is chosen, the board shows only the cards of that project. The count in each column heading, the text "No initiatives", and the announcements of keyboard dragging count only the cards that are shown. The filter is state of the page, so it goes back to "All projects" when the user leaves the page.
- A card that is dragged while the board is filtered lands next to the cards that the user sees. The roadmap is one priority order across all projects, so the cards of other projects must keep their places. The frontend turns the place of the drop into the index among all cards of the column that `move_initiative` expects (ADR 0017), so the command does not change:
  - if a shown card is above the place of the drop, the card goes directly after that shown card,
  - otherwise, if a shown card is below it, the card goes directly before that shown card,
  - otherwise, the column shows no other card, and the card goes to the end of the column.
- A draft created while the board is filtered starts in the project of the filter. A saved initiative that moves to another project leaves a filtered board.

### The project of a meeting

The meeting details sidebar gets a "Project" row between the "Date" row and the "Initiative" row. Its select box, labeled "Meeting project", has an empty choice for no project, and the projects that are not deleted, sorted by the shown name without regard to case. If the meeting is about a deleted project, that project is the last choice until the user chooses another one, as the initiative select box does for a deleted initiative (ADR 0013). The choice is saved at once with `set_meeting_project`. If the save fails, the select box goes back and a failure toast says "Couldn't change the project. Try again."

The "Initiative" select box offers only the initiatives of the meeting's project, in the groups of today. When the meeting has no project, it has only the empty choice and is disabled. When the project changes, the backend clears the initiative (ADR 0019), and the select box shows the empty choice and the initiatives of the new project. The meeting editor keeps the project of the meeting in its state and gives it to both rows.

### Deleting and restoring projects

The delete provider gets a third kind, "project", with the commands `delete_project` and `restore_project`, the default name "Untitled project", the toast `Deleted "<name>".`, and the failure text "Couldn't restore the project. Try again." A restore that answers `nameTaken` says `Couldn't restore "<name>" because another project has that name.`

`delete_project` can answer `hasInitiatives` (ADR 0019). Then the provider shows no delete toast and rejects with an error that says so, and the page shows a failure toast `Couldn't delete "<name>" because it still has initiatives.` This works in the same way from the list of projects and from the project page. Any other failure says "Couldn't delete the project. Try again."

For initiatives, `restore_initiative` can answer `projectDeleted`. Then the toast says `Couldn't restore "<name>" because its project is deleted.` and has no "Undo" button.

After a delete from the project page, the application opens the list of projects and focuses "New project", as the meeting editor does with "New note".

## Consequences

- The project page is a third place with automatic saving, next to the meeting editor and the sheet. All three use `useAutosave` and `SaveStatus`.
- The sheet of an initiative is used on two pages. The page that shows it must give it the project of a draft, and must update its own list after each save, move, and delete.
- The Initiatives page loads the projects to fill the filter and the cards. The initiative sheet loads them to fill its select box.
- The draft of a project changes the route while the editor stays, which the meeting editor never does. The editor must be keyed so that it does not load again when the route changes from `/projects/new` to `/projects/<id>`.
- Feature specs of earlier tickets change where they check the order of the sections, the rows of the meeting sidebar, and the creation of an initiative, which now needs a project.

## Alternatives considered

- **Projects as a sheet over their list**, like initiatives. A project has two lists and a long description, so it needs the room of a page, as ADR 0015 foresaw when it said a sheet may need to become a page.
- **Open an initiative from the project page on the roadmap**, filtered to the project, with its sheet open. The user would leave the project page to edit one initiative and would have to come back.
- **Create a project at once**, like a meeting. An abandoned click would leave an "Untitled project" in the list.
- **A new initiative starts in the project used last.** An initiative could land in the wrong project without the user noticing.
- **No dragging while the roadmap is filtered.** The ticket asks for the filter so that the user can think about the priorities of one project, which includes changing them.
- **A new `move_initiative` argument that names the neighbor card**, instead of an index. It would change a command that works, for a case that the frontend can translate.
