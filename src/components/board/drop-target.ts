import type { Active, Over, UniqueIdentifier } from "@dnd-kit/core";
import type { ReactNode } from "react";

/**
 * A column of a board, with cards of the type `C`. `K` is the type of the identifiers of the
 * columns.
 */
export type BoardColumnDef<C, K extends string = string> = {
    id: K;
    title: string;
    /** The user sets the order of the cards. */
    ordered: boolean;
    /** Cards can be picked up. */
    draggable: boolean;
    /** The text that the column shows when it has no cards. */
    emptyText: string;
    /** An element above the cards, such as a text field. */
    header?: ReactNode;
    /**
     * For a column that is not ordered: returns the place of `card` among `others`, counted
     * from 0. `others` are the cards of the column without `card`, from the top.
     */
    sortedIndex?: (card: C, others: C[]) => number;
};

/**
 * The data of the list area of a column, which is a place to drop a card. `items` holds the
 * identifiers of the cards that the list area shows, from the top.
 */
export type ListData = { column: string; items: UniqueIdentifier[] };

/** The data that dnd-kit gives each sortable card. */
type SortableData = {
    sortable: {
        containerId: UniqueIdentifier;
        index: number;
        items: UniqueIdentifier[];
    };
};

/**
 * The place where a dragged card drops. `index` is the position of the card in `column`,
 * counted from 0 without the card. `count` is the number of cards in `column` with the card.
 */
export type DropTarget<K extends string = string> = {
    column: K;
    index: number;
    count: number;
};

/** Returns the card with the identifier in `cards`, or `undefined` if no column holds it. */
export function findCard<C extends { id: number }>(
    cards: Record<string, C[]>,
    id: UniqueIdentifier,
): C | undefined {
    for (const column of Object.values(cards)) {
        const card = column.find((candidate) => candidate.id === id);
        if (card) return card;
    }
    return undefined;
}

/**
 * Returns the place where the dragged card `active` drops when it is over `over`. `columns`
 * are the columns of the board, and `cards` has all cards of the board.
 *
 * In a column that the user orders: over a card of another column, the dragged card goes
 * before that card. Over a card of its own column, the dragged card takes the place of that
 * card. Over the list area of a column, the dragged card keeps its place in that column, or
 * goes to the end of it.
 *
 * In a column that the user does not order, a card of the column keeps its place, and a card
 * from another column goes to the place that `sortedIndex` of the column gives, or first if
 * the column has no `sortedIndex`.
 *
 * The function reads the column and the index from `over`, because dnd-kit calls it before the
 * board changes its state. It returns `null` if `over` is not a card or a list area of a column
 * in `columns`.
 */
export function dropTarget<C extends { id: number }, K extends string>(
    active: Active,
    over: Over,
    columns: readonly BoardColumnDef<C, K>[],
    cards: Record<string, C[]>,
): DropTarget<K> | null {
    const data = over.data.current as
        Partial<SortableData> | Partial<ListData> | undefined;
    let columnId: unknown;
    let items: UniqueIdentifier[];
    let overIndex: number | null;
    if (data && "sortable" in data && data.sortable) {
        columnId = data.sortable.containerId;
        items = data.sortable.items;
        overIndex = data.sortable.index;
    } else if (data && "column" in data && data.items) {
        columnId = data.column;
        items = data.items;
        overIndex = null;
    } else {
        return null;
    }
    const column = columns.find((candidate) => candidate.id === columnId);
    if (column === undefined) return null;
    const own = items.indexOf(active.id);
    const count = own === -1 ? items.length + 1 : items.length;
    let index: number;
    if (own !== -1 && (!column.ordered || overIndex === null)) index = own;
    else if (!column.ordered) index = sortedPlace(column, active, items, cards);
    else if (overIndex !== null) index = overIndex;
    else index = items.length;
    return { column: column.id, index, count };
}

/** The place of the dragged card `active` among the cards `items` of an unordered column. */
function sortedPlace<C extends { id: number }, K extends string>(
    column: BoardColumnDef<C, K>,
    active: Active,
    items: UniqueIdentifier[],
    cards: Record<string, C[]>,
): number {
    const card = findCard(cards, active.id);
    if (card === undefined || column.sortedIndex === undefined) return 0;
    const others = items
        .map((id) => findCard(cards, id))
        .filter((other): other is C => other !== undefined);
    return column.sortedIndex(card, others);
}
