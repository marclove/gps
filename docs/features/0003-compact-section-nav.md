# Compact navigation between sections

## Situation

When I am working in any section of the application, such as Meetings, and the application will soon have more sections

## Motivation

I want to move between sections quickly without the navigation taking space away from the content I am working on

## Outcome

So I can use most of the window for my work, such as a Kanban board with columns
So I can see at a glance which section I am in and reach any other section in one click
So I can find out what an icon means without guessing

## Acceptance criteria

- The navigation between sections takes only as much width as its icons need
- Each section is shown as an icon, and hovering over it shows the section's name
- The icon of the current section is highlighted, including on pages inside that section, such as a single meeting
- The window uses the standard macOS title bar, and the window controls do not overlap the application's content
- The navigation cannot be hidden, and the page header no longer has a button to show or hide it

## Technical notes

Replace the floating sidebar with a standard sidebar that shows only icons, like the first sidebar in the shadcn `sidebar-09` block. Bring back the native title bar. For now, the only section is Meetings; other sections will arrive with their own tickets.

Sections will need their own navigation between views. Most will probably use a segmented control in the page header. We may later need a second panel beside the icons, like the second sidebar in `sidebar-09`, but not yet.
