# 24. Share one drag and drop board between the roadmap and the Work section

Date: 2026-09-29

## Status

Proposed

Builds on [ADR 0014](0014-drag-cards-with-dnd-kit.md), which it does not supersede. The roadmap keeps every decision of ADR 0014. This ADR moves the parts of the roadmap board that do not depend on initiatives into a shared component, and describes how the Work board uses it.

## Context

Feature ticket 0010 adds the Work page, whose board has four columns: Current, Backlog, Icebox, and Done (Spec 0010, ADR 0023). The user moves tasks between them by dragging cards with the pointer or with the keyboard, and screen readers announce each step. This is what the roadmap already does for initiatives, with dnd-kit (ADR 0014).

The roadmap board lives in `src/features/initiatives/`:

- `roadmap-board.tsx` has the `DndContext`, the two sensors, the collision function `findTarget`, the state of a drag, and the `DragOverlay`, which it renders into `document.body` with a portal.
- `roadmap-column.tsx` has one column: a region with a heading and a count, a list area that `useDroppable` makes a place to drop, and a `SortableContext`. Done uses a sorting strategy that keeps its cards in place, named `keepInPlace`.
- `initiative-card.tsx` has the card, which is one `button` with the `useSortable` listeners, and `InitiativeCardCopy`, the copy that the overlay shows.
- `card-pointer-sensor.ts` has `CardPointerSensor`, which starts a drag after the pointer moves 8 pixels and, after a drop, ignores clicks on cards only.
- `announcements.ts` has `dropTarget`, which reads the column and the index of a drop from the data that dnd-kit gives, and the messages for screen readers.
- `board.ts` has the `Board` type, with the four columns of the roadmap, and functions that build, filter, and change it, such as `moveCard` and `fullIndex`.

Most of this code does not depend on initiatives. It took several rounds of review and a set of browser specs to get right: the overlay that is not cut off by a scrolling column, the collision function that can target an empty column, and the sensor that does not break links after a drop.

The Work board differs from the roadmap in these ways:

| Column  | The user sets the order | Cards can be dragged out | A drop in the column                                   |
| ------- | ----------------------- | ------------------------ | ------------------------------------------------------ |
| Current | Yes                     | Yes                      | goes to the place of the drop                          |
| Backlog | Yes                     | Yes                      | goes to the place of the drop                          |
| Icebox  | No, by `created_at`     | Yes                      | goes to its sorted place, wherever the card drops       |
| Done    | No, by `completed_at`   | No                       | goes to the top                                        |

On the roadmap, the user orders Now, Next, and Later, and Done is sorted and its cards can be dragged out.

Cards differ too. A card in the Backlog has a "Start" button, and a card in Done has a "Reopen" button. The card of the roadmap is itself a button that opens the sheet, and HTML does not allow a button inside a button. The Icebox also has an "Add task" field above its cards, and the announcements say "was moved to Icebox." without a position.

We had to decide whether the two boards share code, which parts, and how a card can hold its own buttons and still be dragged.

## Decision

### A shared board in `src/components/board/`

We move the parts of the roadmap board that do not depend on initiatives to `src/components/board/`, where any feature can use them:

- **The board component.** It owns the `DndContext`, the sensors, `findTarget`, the state of a drag, and the `DragOverlay` in its portal. The state of a drag is the board with the card moved into the column that it is over, the place of the card before the drag, and the identifier of the dragged card, as today.
- **The sensors.** `CardPointerSensor` moves as it is. The keyboard sensor keeps its settings: Space picks a card up and drops it, Escape puts it back, and the arrow keys move it with `sortableKeyboardCoordinates`.
- **The column.** A region named after its title, with the count, a list area to drop on, and a `SortableContext`. The column uses `verticalListSortingStrategy` when the user orders it, and `keepInPlace` when the user does not. It shows the text for an empty column that the board gives, such as "No initiatives" or "No tasks", and an optional element above its cards, which the Work board uses for the "Add task" field.
- **The card shell**, described below.
- **The drop target and the announcements.** `dropTarget` and `announcements` take the column definitions and the text of each message from the board that uses them, instead of the roadmap's `COLUMNS` and words.
- **The generic helpers** `columnOf` and `moveCard`, which work on a record of columns of any card that has a numeric `id`.

Each board supplies:

- its **columns**, in order from left to right. Each column has an identifier, a title, whether the user sets its order, and whether its cards can be dragged. A column whose order the user does not set also gives a function that returns the sorted place of a card among the other cards of the column. The board uses it while a card is over the column, and for the index of a drop there.
- the **cards** of each column, already sorted.
- how to **render the content** of a card, and of its copy in the overlay.
- the **actions** of a card, if any, such as the "Start" button.
- the **text of each announcement**: when a card is picked up, when it is over a column, when it drops, and when it is put back. The board computes the column, the position counted from 1, and the count, and the callbacks turn them into words. The Work board says `<title> was moved to Icebox.` for a drop in the Icebox and `<title> was completed.` for a drop in Done.
- **`onOpen(id)`**, called by a click on a card or Enter.
- **`onMove(id, column, index)`**, called when a card drops at a new place, with the index among the cards of that column, counted without the card. As today, the board then shows the cards that it gets again, so the page must move the card in its own state.

Card identifiers are numbers and column identifiers are text, as today. `findTarget` uses this to tell a card from the list area of a column.

### What stays with each feature

- The roadmap keeps `buildBoard`, `filterBoard`, `fullIndex`, `addCard`, `replaceCard`, `removeCard`, and its `Board` type in `src/features/initiatives/board.ts`. The filter by project is a choice of the Initiatives page, and `fullIndex`, which turns a place among the shown cards into a place among all cards of a column (ADR 0020), stays in the page. The content of an initiative card and its words stay in `initiative-card.tsx`.
- The Work feature, in `src/features/work/`, has its own function that builds the four columns from the tasks, the content of a task card with its project name and check mark, the "Start" and "Reopen" actions, and its words. It sends the index that the board gives straight to `move_task`, because the backend turns an index in Current or the Backlog into a place in the list (ADR 0023).

The roadmap must keep its exact behavior. Its browser specs (`roadmap.browser.spec.tsx`, `filtered-roadmap.browser.spec.tsx`) and the unit tests of `announcements.ts` and `board.ts` guard the move. The unit tests of the moved parts move with them. Each move is a separate step, with all tests passing after it.

### Columns that the user does not order

For a column whose order the user does not set, the board treats a drop in the same way wherever it lands:

- While a card from another column is over it, the card shows at its sorted place, and the other cards do not make room, because the strategy keeps them in place. For Done on both boards, the sorted place is the top, because the card will be the one completed last. For the Icebox, it is the place of the card's `created_at` among the others.
- A drop gives `onMove` that sorted place as the index. The backend ignores it for these columns, but the page uses it to move the card in its own state.
- A card that drops in its own column is put back. Nothing is saved, and the announcement says `<title> was put back.` This is the rule of Done on the roadmap today.

A column whose cards cannot be dragged, which is Done on the Work board, gives each card `useSortable` with `disabled: true`. Its cards cannot be picked up with the pointer or with Space. They still open the sheet.

### A card with its own buttons

The card shell is no longer one button. It is a container with:

- **an open button**, which shows the content of the card. Its accessible name starts with the title, as the specs require. A click or Enter calls `onOpen`. It carries the `useSortable` attributes and listeners, and it is the activator node of dnd-kit (`setActivatorNodeRef`), so Space picks the card up from it, and keyboard focus returns to it after a drop. It covers the whole card, so a press anywhere on the card that is not on an action starts a drag.
- **the action buttons** of the board, such as "Start" or "Reopen", which sit above the open button, next to it in the page and not inside it.

The container is the sortable node (`setNodeRef`). dnd-kit measures it and moves it with a transform, and it has the attribute `data-card-id`, so that a page can find a card and focus it. The roadmap used `data-initiative-id` for this, only inside the Initiatives page.

`CardPointerSensor` does not change. dnd-kit calls its activator only for a `pointerdown` on the element that has the listeners, which is the open button. A press on an action button reaches that button and not the open button, because the action is not inside the open button, so it never starts a drag. It stays a click, and Space and Enter on an action button activate it as for any button. After a drop, the sensor ignores clicks inside the dragged container, which includes its actions, so the click that ends a drag cannot press "Start" either.

Cards of the roadmap have no actions. For them, the open button covers the whole card as the button does today.

### Moves on the Work page

The Work page keeps the columns in its own state, as the Initiatives page keeps its board:

- A drop moves the card in the state at once, and calls `move_task`. When the command answers, the page replaces the card with the returned task, which has its new rank and start, without sorting again.
- The "Start" button moves the card from the Backlog to Current at once, at the place of its rank, and calls `start_task`.
- The "Reopen" button waits for `set_task_completed`, and then puts the returned task in the column of its stage, at the place of its rank. The frontend cannot know where the task goes when its held place was taken, because only the backend makes keys.
- When a move or a start fails, the page shows the failure toast of Spec 0010 and loads the tasks again once no other move is waiting, as ADR 0014 decided for the roadmap. For a single move, this puts the card back where it was.

## Consequences

- The roadmap and the Work board share the difficult parts: the overlay, the collision function, the sensors, and the announcements. A fix to one of them fixes both boards.
- The shared board has more props than the roadmap board had. The column definitions carry the differences between the boards, so the board component has no condition that names a feature or a column.
- The initiative card changes its structure from a button to a container with a button. Its behavior and its accessible name do not change, and the roadmap's specs check this.
- A later board, such as one for key results, can use the same component.
- The move is several steps of work before the first change that the user sees, and every step must keep the roadmap's browser specs passing.

## Alternatives considered

- **Copy the roadmap board into `src/features/work/`** and change what differs. It is the fastest start, but the most difficult code would exist twice, and a fix to one copy would not reach the other. ADR 0016 rejected copying the editor parts for the same reason.
- **A third party kanban component.** It would replace the dnd-kit setup that ADR 0014 chose and tested in WebKit, including the sensor that keeps links working after a drop and the messages in the words of each board. We would have to test all of that again, for a component that we do not control.
- **Make the roadmap board generic with type parameters, and leave it in `src/features/initiatives/`.** The Work feature would import from the initiatives feature for code that is not about initiatives, and the names of the files would stay misleading. Code that more than one feature uses belongs in `src/components/`.
- **Put the "Start" and "Reopen" buttons inside the card button.** HTML does not allow a button inside a button. Browsers handle it in different ways, and screen readers announce it poorly.
- **Refuse a drag in `CardPointerSensor` when the pointer is on an element marked as an action.** It would work with listeners on the whole card, but it would add a rule to the sensor that the structure of the card already gives, and the keyboard listeners would still need to stay off the actions.
- **Leave out "Start" and "Reopen", and change stages only by dragging**, as the roadmap does (ADR 0015). The ticket asks for a "Start" button, and a button is quicker than a drag for the most common change.
