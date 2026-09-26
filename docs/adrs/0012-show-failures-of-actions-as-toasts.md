# 12. Show failures of actions as toasts

Date: 2026-09-26

## Status

Accepted. This decision supersedes the rule in ADR 0009 that messages about a failed action stay next to the control that failed. The other decisions of ADR 0009 stay.

## Context

ADR 0009 decided to show the result of an action, such as "Archived", in a toast. A toast is a small box at the bottom right of the window that closes by itself. ADR 0009 also decided that a message about a failed action that the user can try again, such as "Couldn't archive the meeting. Try again.", stays next to the control that failed.

Feature 0005 moves the Archive button of the editor page into the meeting's sidebar (ADR 0011). It also adds an action items panel with three messages of the same kind: "Couldn't add the action item. Try again.", "Couldn't save the action item. Try again.", and "Couldn't remove the action item. Try again." Each place that shows such a message needs room for it, and the layout moves when the message appears. The sidebar is narrow, so this cost is higher there. The user asked for these messages to be toasts on every page, so that all messages about actions appear in one place and look the same.

Some messages describe the state of an area instead of the failure of one action. Examples are "Couldn't load action items" with a "Retry" button, and the "Couldn't save" status of the meeting's automatic saving with its "Retry" button. These messages must stay visible for as long as the state lasts, and a toast closes by itself.

## Decision

- A message that reports that an action failed, and that the user can try the action again, is shown in a toast. This applies on every page. Today these messages are:
  - "Couldn't archive the meeting. Try again.", on the Meetings page and on the editor page,
  - "Couldn't add the action item. Try again.",
  - "Couldn't save the action item. Try again.",
  - "Couldn't remove the action item. Try again."
- A message that describes the state of an area stays in that area. "Couldn't load action items" with its "Retry" button, and the "Couldn't save" status with its "Retry" button, do not change.
- A failure toast shows the message and a "Close" button. It has no other button. It closes by itself after 8 seconds, like the archive toast, and the same pauses apply: the time does not count while the pointer is over the toast or while the toast has keyboard focus. It does not take keyboard focus. It has high priority, so a screen reader announces it at once.
- At most one failure toast is open at a time in the window. When another action fails, the open failure toast closes and a new one opens. When an action succeeds that could have shown a failure toast, the open failure toast closes. A failure toast and an archive toast can be open together.
- A provider in `App.tsx`, next to the `ArchiveProvider`, owns the failure toast. Pages use it through a hook, `useFailureToast()`, which returns `show(message)` and `clear()`. The provider remembers which toast is open, so every page and panel shares the rule "at most one failure toast".

## Consequences

- Layouts no longer move when an action fails, and the narrow sidebar needs no room for messages.
- The user sees every message about an action in the same place. A failure toast stays open when the user opens another page, as ADR 0009 describes for all toasts.
- A failure toast closes by itself. After that, the only sign of the failure is the state of the page, for example an item that is still in the list or text that is still in the "Add action item" field. This is enough, because the user can see what did not change and try again.
- A failure toast is not next to the control that failed, so its text must name the action and the thing it acted on.
- Two toasts can now be open at the same time. The toast viewport shows them stacked. The comment in `src/components/toaster.tsx` that says the application shows at most one toast at a time must change.
- Specs 0004 and 0005 describe the failure messages next to their controls. Spec 0005 records the change for both.
- Tests find failure messages in the region named "Notifications", which is rendered at the end of the page body.

## Alternatives considered

- Keep the rule of ADR 0009, and show each failure next to its control. This keeps a failure close to where the user looks, but every control needs room for a message, and the user asked for one place for all messages.
- Show failures as toasts only on the editor page. The two pages that can archive a meeting would then report the same failure in two different ways.
- Show the state messages, such as "Couldn't load action items", as toasts too. A toast closes by itself, but the area stays empty or unsaved, and its "Retry" button must stay available.
- One toast for each failure, with no limit. Several failures in a row, for example while the database is locked, would fill the corner of the window with toasts that say the same thing.
