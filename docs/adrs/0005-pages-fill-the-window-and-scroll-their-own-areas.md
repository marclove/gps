# 5. Pages fill the window and scroll their own areas

Date: 2026-09-25

## Status

Accepted

## Context

The application shell (see ADR 0001) has a sidebar and a main area. Until now, the shell was at least as tall as the window and grew with its content. When a page was taller than the window, the whole window scrolled. On the meeting editor page, this means that the page header, the meeting name, the meeting date, and the formatting toolbar move out of view when the user scrolls down through long notes. The feature ticket asks for these controls to stay at the top of the window while only the notes scroll.

We use the word "chrome" for the parts of a page that are not its content, such as headers, titles, and toolbars.

The application will get more kinds of pages, such as a company directory, a glossary, initiatives, OKRs (objectives and key results), and a work tracker that shows tasks as cards in columns. These pages need different scrolling. A list page needs one area that scrolls below a header. A page with a list beside a detail view needs two areas that scroll independently. A board of columns needs an area that scrolls sideways and columns that each scroll up and down. The decision here must allow all of these without deciding their layouts now.

## Decision

- The shell is exactly as tall as the window. The window itself never scrolls. The sidebar wrapper (`SidebarProvider`) has the height of the window, and the main area (`SidebarInset`) cannot grow taller than the space that it has.
- Each page fills the main area and decides which of its areas scroll. A page can have no scrolling area, one, or more than one, and an area can scroll up and down, sideways, or both. Chrome is outside the scrolling areas, so it stays in place.
- Pages arrange their areas with CSS grid. A grid sets the size of each row and column in one place, for example `auto` for a header row, which is as tall as its content, and `1fr` for a content row, which takes the remaining space. A scrolling area is a grid cell that has `min-height: 0` and `overflow: auto`. Without `min-height: 0`, a grid or flex item grows to the height of its content, and nothing scrolls.
- Scrolling areas use the browser's native scrolling (`overflow: auto` on an ordinary element), not a component that draws its own scroll bars, such as shadcn's `ScrollArea`. Native scrolling on macOS has overlay scroll bars and momentum scrolling that match other Mac applications.
- A component can bring its own chrome and its own scrolling area. The notes editor is a grid of two rows: its toolbar and its scrolling notes. A page places the whole editor in one of its grid cells. This keeps the toolbar with the editor that it controls, so that the editor can be used on other pages, in a panel, or in a dialog without extra work.

We do not add a shared page layout component, a required set of grid areas, or a scrolling area component. The layouts of future pages are not yet known. When a pattern repeats on several pages, it can be extracted then.

## Consequences

- The page header is always visible, so the button that shows or hides the sidebar and the area that moves the window can always be reached.
- Every page must make room for its content inside the height of the window. A page whose content is taller than its space, and that has no scrolling area, cuts the content off. New pages must decide which areas scroll.
- A scrolling area is a separate element, not the document, so code that reads `window.scrollY` or listens for scroll events on `window` does not see it. The notes editor keeps the text cursor in view by itself, because ProseMirror scrolls the nearest scrolling ancestor of the cursor.
- Layout that depends on CSS, such as whether an area scrolls, cannot be checked in jsdom, which does not calculate layout. ADR 0006 adds tests that run in a real browser engine for this.

## Alternatives considered

- Keep the window scrolling and make the chrome "sticky" with `position: sticky`, so that it stays at the top while the page scrolls under it. This is the smallest change, but the scroll bar then runs beside the chrome, the page has only one scrolling area, and a board with columns that scroll independently is much harder to build.
- A flat editor page grid in which the formatting toolbar and the notes are separate cells of the page. This would split the notes editor into a toolbar component and a content component, and the page would have to create the editor and pass it to both. Every page that uses the editor would repeat that work.
- A shared page layout component that every page uses, with fixed areas such as a header, a toolbar, and a body. The pages that we know about need different layouts, so a shared component now would be designed for guesses.
