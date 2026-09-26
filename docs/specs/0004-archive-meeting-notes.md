# Spec 0004: Archive meetings

Ticket: [0004 Archiving meeting](../features/0004-archive-meeting-notes.md)

Executable specs: `src/features/meetings/archive.spec.tsx` and `src/features/meetings/archive.browser.spec.tsx`

## Summary

A user who creates a meeting by mistake can archive it, from the list of meetings or from the meeting's editor page. An archived meeting no longer appears in the list of meetings. Right after archiving, a toast names the archived meeting and offers an "Undo" button that restores it. Archived meetings and their notes are kept in the database.

## Terms

- **Archive**: to hide a meeting from the list of meetings without deleting it.
- **Restore**: to make an archived meeting appear in the list of meetings again.
- **Archive toast**: a small box at the bottom right of the window, above the page content, that names the meeting that was just archived and has an "Undo" button and a "Close" button. Toasts are inside a region named "Notifications". See [ADR 0009](../adrs/0009-show-brief-notifications-as-toasts.md).

The terms "meeting", "Meetings page", and "editor page" are defined in [Spec 0001](0001-take-meeting-notes.md).

## Behavior

### Archiving from the Meetings page

- Each meeting in the list has a button, next to the link that opens the meeting, that archives it. The button shows an icon and has the accessible name `Archive "<name>"`, such as `Archive "Weekly sync"`. For a meeting with an empty name, the name is "Untitled meeting", as in the list.
- The button is always in the page for keyboard and screen reader users. A keyboard user reaches it with Tab from the meeting's link. It is visible only when the pointer is over the meeting's row or when the button has keyboard focus.
- When the user clicks the button, the meeting is archived and removed from the list. The other meetings stay in the same order. There is no confirmation dialog, because the action can be undone.
- If the archived meeting was the only meeting, the page says "No meetings yet".
- If the meeting cannot be archived, it stays in the list, and the page says "Couldn't archive the meeting. Try again."
- After an archive, keyboard focus moves to the archive button of the meeting that is now in the same position in the list, which is the next meeting. If the archived meeting was the last one in the list, focus moves to the archive button of the meeting before it. If the list is now empty, focus moves to the "New note" button. Focus does not move to the archive toast.

### Archiving from the editor page

- The page header of the editor page has a button named "Archive", next to the save status.
- When the user clicks it, the meeting is archived, the Meetings page opens, and the archive toast appears. The archived meeting is not in the list.
- When the Meetings page opens after an archive from the editor page, keyboard focus moves to the "New note" button. Focus does not move to the archive toast.
- A change to the name, date, or notes that was not yet saved is saved when the editor page closes, as for any other way of leaving the editor page. The change is not lost.
- If the meeting cannot be archived, the editor page stays open with the user's text, and the page says "Couldn't archive the meeting. Try again."

### Archive toast and Undo

- After a meeting is archived, from the Meetings page or from the editor page, the archive toast appears with the text `Archived "<name>".`, a button named "Undo", and a button named "Close". The name is the name of the meeting at the time it was archived, even if that name was not yet saved.
- The toast closes by itself 8 seconds after it appears. The time does not count while the pointer is over the toast or while the toast has keyboard focus.
- The toast is at the bottom right of the window.
- Inside the toast, the text is at the left, and the "Undo" and "Close" buttons are at the right side of the toast, with "Close" last.
- When the user clicks "Close", the toast closes, and the meeting stays archived.
- The toast stays open when the user opens another page.
- When the user clicks "Undo", on any page, the meeting is restored and the toast closes. If the Meetings page is open, the meeting appears in the list again, in its usual place in the order, and keyboard focus moves to the meeting's link. If the Meetings page is not open, the meeting is in the list the next time the Meetings page opens.
- If the meeting cannot be restored, the toast stays open, its text changes to `Couldn't restore the meeting. Try again.`, and its "Undo" button tries again. The 8 seconds start again.
- Only one archive toast is open at a time. When the user archives another meeting, the toast for the earlier meeting closes and a toast for the new meeting appears. "Undo" restores only the meeting that was archived last.
- After the toast has closed, the meeting stays archived.

### Archived meetings stay hidden

- An archived meeting does not appear in the list of meetings when the user opens the Meetings page again, or after the application is closed and opened again.
- Archiving a meeting does not change its name, date, notes, or the time it was last changed.

## Not checked by the executable specs

The executable specs do not check that the 8 seconds stop while the pointer is over the toast or the toast has focus, or that they start again after a failed restore. Base UI's toast provides this behavior. Check it by hand with `bun run tauri dev`.

## Backend contract

The executable spec replaces the Tauri backend with an in-memory fake. It relies on the commands of [Spec 0001](0001-take-meeting-notes.md), with this change and these additions, which the real backend must provide:

| Command             | Arguments | Result                                           |
| ------------------- | --------- | ------------------------------------------------ |
| `list_meetings`     | none      | list of summaries of the meetings that are not archived |
| `archive_meeting`   | `id`      | nothing (`null`)                                 |
| `unarchive_meeting` | `id`      | nothing (`null`)                                 |

- `archive_meeting` records the time when the meeting was archived. Archiving a meeting that is already archived keeps the time that was recorded first.
- `unarchive_meeting` makes the meeting appear in `list_meetings` again.
- Both commands reject with a message when no meeting has the identifier or the database reports an error.
- `get_meeting` and `update_meeting` work for archived meetings in the same way as for other meetings.
- The meeting and meeting summary types do not change.

## Out of scope

- A page or filter that shows archived meetings.
- Restoring a meeting after the archive toast has closed.
- Deleting meetings permanently.
- Archiving several meetings at once.
- Showing the archive button on a touch screen, where there is no pointer to rest on a row.
