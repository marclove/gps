# 9. Show brief notifications as toasts

Date: 2026-09-26

## Status

Accepted

## Context

Some actions need a short message after they finish, often with a way to reverse them. The first such action is archiving a meeting (see ADR 0008): after a meeting is archived, the application says which meeting it archived and offers an "Undo" button.

The first design showed this message as a line of text near the top of the Meetings page. The message was part of that page, so it disappeared when the user opened another page. When the user archived a meeting from its editor page, the editor had to pass the message to the Meetings page through the router's location state, and the Meetings page had to own the "Undo" logic.

A toast is a small box that appears in a corner of the window, above the page content, and closes by itself after some seconds. Many desktop and web applications show messages like "Archived" with an "Undo" button in a toast. We decided to use toasts for this kind of message, and had to decide which component to use, where toasts live in the component tree, and which part of the application owns the action that a toast can reverse.

The user interface components come from shadcn (see `components.json`). The project's shadcn style, `base-nova`, is built on the Base UI library, which the project already uses. It offers two toast components: `toast`, which is built on Base UI's `Toast`, and `sonner`, which wraps the separate `sonner` library.

## Decision

- Use the shadcn `toast` component of the `base-nova` style, added with `bunx --bun shadcn@latest add toast` into `src/components/ui/toast.tsx`. It uses Base UI's `Toast`, so it adds no new dependency. The generated file is edited to use `lucide-react` icons and the `cn` helper from `@/lib/utils`, like the other components in `src/components/ui/`.
- One toast provider and one toast viewport are mounted in `App.tsx`, outside the routes. Toasts appear at the bottom right of the main window, and a toast stays open when the user opens another page.
- A toast closes by itself after its timeout. Base UI pauses the timeout while the pointer is over the toast or the toast has focus. Each toast has a close button.
- Toasts do not take keyboard focus when they appear. Base UI announces them to screen readers, and the user can move focus to the toasts with the F6 key.
- The action that a toast can reverse is owned by a provider in `App.tsx`, not by a page, because the toast can outlive the page that started the action. For archiving, an `ArchiveProvider` in `src/features/meetings/` archives a meeting, shows the toast, and restores the meeting when the user clicks "Undo". Pages call the provider through a hook. A page that shows data that such an action changes, such as the list of meetings, reloads its data when the provider reports a change.
- Messages that report a failure of an action that the user can simply try again, such as "Couldn't archive the meeting. Try again.", stay next to the control that failed. A toast is for the result of an action, not for the failure to start one.

## Consequences

- The "Archived" message and its "Undo" button look and behave the same after an archive from the list and after an archive from the editor. The editor no longer passes the message to the Meetings page through the router.
- A toast closes by itself, so the user can undo an archive only while the toast is open, or while they rest the pointer on it. After that, the meeting stays archived. The application has no page that shows archived meetings yet.
- Later features can show their own toasts with the same provider and viewport.
- Tests that check a toast must find it in the whole document, because Base UI renders the viewport in a portal at the end of the page body. Tests that check the timeout must control time with fake timers.

## Alternatives considered

- Keep the message inline on the Meetings page. It is simpler and has no timeout, but it is not visible on other pages, and it needs the router handoff from the editor.
- The shadcn `sonner` component. Sonner is widely used and has a simple function call API, but it adds the `sonner` and `next-themes` libraries, and the application does not use themes.
- Move focus to the "Undo" button in the toast. A keyboard user could undo at once, but a toast that takes focus interrupts the user, and focus would be lost when the toast closes by itself.
