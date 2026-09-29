import type { Active, Announcements } from "@dnd-kit/core";
import { columnOf } from "./cards";
import { dropTarget, findCard, type BoardColumnDef } from "./drop-target";

/**
 * The text of each message that screen readers announce while a card of the type `C` is
 * dragged. `position` counts from 1, and `count` is the number of cards in `column` with the
 * card.
 */
export type BoardMessages<C, K extends string = string> = {
    /** The card was picked up. */
    pickedUp: (card: C) => string;
    /** The card is over `column`, at `position`. */
    over: (
        card: C,
        column: BoardColumnDef<C, K>,
        position: number,
        count: number,
    ) => string;
    /** The card dropped in `column`, at `position`. */
    dropped: (
        card: C,
        column: BoardColumnDef<C, K>,
        position: number,
        count: number,
    ) => string;
    /** The card went back to its place. */
    putBack: (card: C) => string;
};

/**
 * Returns the messages that screen readers announce while a card of a board is dragged.
 * `columns` are the columns of the board, `cards` has the cards of each column before the
 * drag, and `messages` gives the text of each message. A card that drops outside the columns,
 * or in its own column when the user does not order that column, was put back. If `cards` does
 * not hold the dragged card, the messages are empty.
 */
export function boardAnnouncements<C extends { id: number }, K extends string>(
    columns: readonly BoardColumnDef<C, K>[],
    cards: Record<K, C[]>,
    messages: BoardMessages<C, K>,
): Announcements {
    const cardOf = (active: Active) => findCard(cards, active.id);
    const columnDef = (id: K) => columns.find((column) => column.id === id)!;
    return {
        onDragStart: ({ active }) => {
            const card = cardOf(active);
            return card ? messages.pickedUp(card) : "";
        },
        onDragOver: ({ active, over }) => {
            const card = cardOf(active);
            const target = over && dropTarget(active, over, columns, cards);
            if (!card || !target) return undefined;
            return messages.over(
                card,
                columnDef(target.column),
                target.index + 1,
                target.count,
            );
        },
        onDragEnd: ({ active, over }) => {
            const card = cardOf(active);
            if (!card) return "";
            const target = over && dropTarget(active, over, columns, cards);
            if (!target) return messages.putBack(card);
            const column = columnDef(target.column);
            if (!column.ordered && columnOf(cards, card.id) === column.id)
                return messages.putBack(card);
            return messages.dropped(
                card,
                column,
                target.index + 1,
                target.count,
            );
        },
        onDragCancel: ({ active }) => {
            const card = cardOf(active);
            return card ? messages.putBack(card) : "";
        },
    };
}
