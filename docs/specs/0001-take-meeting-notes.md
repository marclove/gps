# Spec 0001: Take meeting notes

Ticket: [0001 Take meeting notes](../features/0001-take-meeting-notes.md)

Executable spec: `src/features/meetings/meetings.spec.tsx`

## Summary

A user can see a list of their meeting notes, create a new note with one click, and write notes in a rich text editor. Changes are saved automatically. Each note has a meeting name, a meeting date, and the notes themselves, which are stored as Markdown.

## Terms

- **Meeting**: one record that the user creates. It has a name, a date, and notes. In the user interface, the button that creates a meeting is labeled "New note", because the user thinks of it as starting a new set of notes.
- **Meetings page**: the page that lists all meetings.
- **Editor page**: the page that shows one meeting, where the user edits its name, date, and notes.

## Behavior

### Application shell

- The application opens on the Meetings page.
- A sidebar is always visible unless the user hides it. Its navigation, labeled "Main", contains a "Meetings" link that opens the Meetings page from anywhere.
- The header of the main area shows a breadcrumb trail. On the Meetings page it shows "Meetings". On the editor page it shows "Meetings", which links back to the Meetings page, followed by the name of the meeting.

### Meetings page

- The page shows a "New note" button.
- When there are no meetings, the page says "No meetings yet".
- When there are meetings, each one is shown as a link that contains its name and its date. The date is written in the user's locale in the medium date style, such as "Sep 24, 2026" in United States English.
- Meetings are shown in the order that the backend returns them: the newest meeting date first and, for meetings on the same date, the most recently created first.
- If the list cannot be loaded, the page says "Couldn't load meetings" and shows a "Retry" button that loads the list again.

### Creating a meeting

- When the user clicks "New note", a meeting is created with the name "Untitled meeting" and today's date in the user's local time zone, and the editor page for it opens.
- On the new meeting's editor page, the meeting name field has focus and its text is selected, so the user can type a name at once.

### Editor page

- The page shows a text field labeled "Meeting name", a date field labeled "Meeting date", a formatting toolbar, and a multi-line text area labeled "Notes".
- When the user opens an existing meeting, the notes are shown formatted. For example, stored Markdown `## Agenda` is shown as a heading, and `- [x] Review roadmap` is shown as a checked checklist item. The Markdown punctuation itself is not shown.
- The toolbar has buttons labeled "Bold", "Italic", "Heading 1", "Heading 2", "Heading 3", "Bullet list", "Numbered list", and "Task list", which apply that formatting.
- If the meeting does not exist, the page says "This meeting doesn't exist" and links back to the Meetings page.

### Saving

- There is no save button. When the user changes the name, the date, or the notes, the change is saved automatically after the user pauses for about half a second.
- Notes are saved as Markdown. For example, a checklist item with the text "Send notes to team" is saved as `- [ ] Send notes to team`.
- A save always includes the latest name, date, and notes together.
- After a save, the new name appears in the breadcrumb and in the list of meetings.
- A status in the header shows "Saving…" while a save is in progress and "Saved" after it finishes.
- If a save fails, the status says "Couldn't save". The user's text stays in the editor and is not lost. The next change tries to save again, and a "Retry" button next to the status tries again immediately.
- If the user leaves the editor page before the pause ends, the pending change is saved at once.

## Backend contract

The executable spec replaces the Tauri backend with a fake that stores meetings in memory. It relies on these commands, which the real backend must provide:

| Command          | Arguments                  | Result                  |
| ---------------- | -------------------------- | ----------------------- |
| `list_meetings`  | none                       | list of meeting summaries |
| `create_meeting` | `date`                     | meeting                 |
| `get_meeting`    | `id`                       | meeting, or `null` if no meeting has the identifier |
| `update_meeting` | `id`, `name`, `date`, `notes` | meeting              |

A meeting has the fields `id` (number), `name`, `date` (`YYYY-MM-DD`), `notes` (Markdown), `createdAt`, and `updatedAt` (RFC 3339 timestamps in UTC). A meeting summary has `id`, `name`, `date`, and `updatedAt`. When a command fails, it rejects with a message.

## Out of scope

- Deleting meetings.
- Searching, filtering, or grouping meetings.
- Remembering which page was open when the application was closed.
