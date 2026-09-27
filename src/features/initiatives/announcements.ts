import type {
    Active,
    Announcements,
    Over,
    UniqueIdentifier,
} from "@dnd-kit/core";
import { COLUMNS, initiativeDisplayName, type Column } from "@/lib/initiatives";

/**
 * The data of the list area of a column, which is a place to drop a card. `items` holds the
 * identifiers of the cards that the list area shows, from the top.
 */
export type ListData = { column: Column; items: UniqueIdentifier[] };

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
export type DropTarget = { column: Column; index: number; count: number };

function isColumn(value: unknown): value is Column {
    return COLUMNS.some((column) => column.id === value);
}

/**
 * Returns the place where the dragged card `active` drops when it is over `over`. Over a card
 * of another column, the dragged card goes before that card. Over a card of its own column,
 * the dragged card takes the place of that card. Over the list area of a column, the dragged
 * card keeps its place in that column, or goes to the end of it. In Done, a card from another
 * column goes first, and a card of Done keeps its place. The function reads the column and
 * the index from `over`, because dnd-kit calls it before the board changes its state. It
 * returns `null` if `over` is not a card or a list area.
 */
export function dropTarget(active: Active, over: Over): DropTarget | null {
    const data = over.data.current as
        Partial<SortableData> | Partial<ListData> | undefined;
    let column: unknown;
    let items: UniqueIdentifier[];
    let overIndex: number | null;
    if (data && "sortable" in data && data.sortable) {
        column = data.sortable.containerId;
        items = data.sortable.items;
        overIndex = data.sortable.index;
    } else if (data && "column" in data && data.items) {
        column = data.column;
        items = data.items;
        overIndex = null;
    } else {
        return null;
    }
    if (!isColumn(column)) return null;
    const own = items.indexOf(active.id);
    const count = own === -1 ? items.length + 1 : items.length;
    let index: number;
    if (column === "done") index = own === -1 ? 0 : own;
    else if (overIndex !== null) index = overIndex;
    else index = own === -1 ? items.length : own;
    return { column, index, count };
}

function title(column: Column): string {
    return COLUMNS.find((candidate) => candidate.id === column)?.title ?? "";
}

/**
 * Returns the messages that screen readers announce while a card of the roadmap is dragged.
 * `nameOf` returns the saved name of the initiative with the identifier. A message uses the
 * shown name, and positions count from 1.
 */
export function announcements(
    nameOf: (id: UniqueIdentifier) => string,
): Announcements {
    const name = (active: Active) => initiativeDisplayName(nameOf(active.id));
    return {
        onDragStart: ({ active }) => `Picked up ${name(active)}.`,
        onDragOver: ({ active, over }) => {
            const target = over && dropTarget(active, over);
            if (!target) return undefined;
            return `${name(active)} is in ${title(target.column)}, position ${target.index + 1} of ${target.count}.`;
        },
        onDragEnd: ({ active, over }) => {
            const target = over && dropTarget(active, over);
            if (!target) return `${name(active)} was put back.`;
            if (target.column === "done")
                return `${name(active)} was completed.`;
            return `${name(active)} was moved to ${title(target.column)}, position ${target.index + 1} of ${target.count}.`;
        },
        onDragCancel: ({ active }) => `${name(active)} was put back.`,
    };
}
