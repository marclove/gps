import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    pointerWithin,
    rectIntersection,
    useSensor,
    useSensors,
    type CollisionDetection,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { boardAnnouncements, type BoardMessages } from "./announcements";
import { BoardColumn } from "./board-column";
import { CardPointerSensor } from "./card-pointer-sensor";
import { columnOf, moveCard } from "./cards";
import { dropTarget, findCard, type BoardColumnDef } from "./drop-target";

export type { BoardMessages } from "./announcements";
export type { BoardColumnDef } from "./drop-target";

/** The column and the index of a card, counted from 0. */
type Place<K extends string> = { column: K; index: number };

function placeOf<C extends { id: number }, K extends string>(
    cards: Record<K, C[]>,
    id: number,
): Place<K> | null {
    const column = columnOf(cards, id);
    if (column === null) return null;
    return {
        column,
        index: cards[column].findIndex((card) => card.id === id),
    };
}

/**
 * Finds the card or the list area that a dragged card is over. With the pointer, it is the
 * card or the list area under the pointer. With the keyboard, it is the card or the list area
 * that the dragged card overlaps most. A card comes before a list area. Over a list area but
 * not over a card, it is the card of that list area with the nearest center, or the list area
 * when it has no cards. Outside the list areas, the dragged card is over nothing.
 *
 * The standard detection of dnd-kit that compares corners does not find a list area. The list
 * areas are as tall as the columns, so their bottom corners are far from the dragged card.
 */
const findTarget: CollisionDetection = (args) => {
    const hits = args.pointerCoordinates
        ? pointerWithin(args)
        : rectIntersection(args);
    const card = hits.find((hit) => typeof hit.id === "number");
    if (card) return [card];
    const list = hits.find((hit) => typeof hit.id === "string");
    if (!list) return [];
    const cards = args.droppableContainers.filter(
        (container) =>
            container.data.current?.sortable?.containerId === list.id,
    );
    return cards.length === 0
        ? [list]
        : closestCenter({ ...args, droppableContainers: cards });
};

/**
 * A board of cards in columns of equal width, from left to right in the order of `columns`.
 * `cards` has the cards of each column, from the top. The board fills the height that it gets,
 * and each column scrolls its own list of cards. While `loading` is true, the columns show
 * their headings and no cards.
 *
 * Each card is an open button that shows `renderContent`, with the buttons of `renderActions`
 * beside it. A click on a card, or the Enter key, calls `onOpen` with its identifier.
 *
 * The user drags a card of a column whose cards are `draggable` with the pointer, or with the
 * keyboard: Space picks the card up and drops it, the arrow keys move it, and Escape puts it
 * back. While a card is dragged over another column, the board shows it in that column: at the
 * place under it in a column that the user orders, and at the place that `sortedIndex` gives
 * in a column that the user does not order. While a card is dragged, the board draws
 * `renderCopy` below the pointer, above the columns, because the scrolling list of a column
 * would cut off the card itself at the edge of the column. Screen readers announce each step
 * with the text of `messages`.
 *
 * When a card drops at a new place, the board calls `onMove` with the identifier, the column,
 * and the index of the card in that column, counted without the card. A card that drops in its
 * own column when the user does not order that column is put back, and the board does not call
 * `onMove`. The board then shows `cards` again, so the page must move the card in `cards` when
 * `onMove` is called.
 */
export function Board<C extends { id: number }, K extends string = string>({
    columns,
    cards,
    renderContent,
    renderCopy,
    renderActions,
    messages,
    onOpen,
    onMove,
    loading,
}: {
    columns: readonly BoardColumnDef<C, K>[];
    cards: Record<K, C[]>;
    /** The content of the open button of `card` in `column`. */
    renderContent: (card: C, column: K) => ReactNode;
    /** The copy of `card` that the board shows while `card` is dragged over `column`. */
    renderCopy: (card: C, column: K) => ReactNode;
    /** The action buttons of `card` in `column`. */
    renderActions?: (card: C, column: K) => ReactNode;
    messages: BoardMessages<C, K>;
    onOpen: (id: number) => void;
    onMove: (id: number, column: K, index: number) => void;
    loading: boolean;
}) {
    // The cards while a card is dragged, with the card in the column that it is over.
    const [dragCards, setDragCards] = useState<Record<K, C[]> | null>(null);
    // The place of the dragged card before the drag.
    const origin = useRef<Place<K> | null>(null);
    // The identifier of the dragged card.
    const [activeId, setActiveId] = useState<number | null>(null);
    const shown = dragCards ?? cards;
    const activeColumn = activeId === null ? null : columnOf(shown, activeId);
    const activeCard =
        activeId === null ? undefined : findCard(shown, activeId);
    const sensors = useSensors(
        useSensor(CardPointerSensor, { distance: 8 }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
            keyboardCodes: {
                start: ["Space"],
                end: ["Space"],
                cancel: ["Escape"],
            },
        }),
    );
    const announcements = useMemo(
        () => boardAnnouncements(columns, cards, messages),
        [columns, cards, messages],
    );

    function columnDef(id: K): BoardColumnDef<C, K> {
        return columns.find((column) => column.id === id)!;
    }

    function start({ active }: DragStartEvent) {
        origin.current = placeOf(cards, Number(active.id));
        setActiveId(Number(active.id));
        setDragCards(cards);
    }

    function over({ active, over }: DragOverEvent) {
        const target =
            over === null ? null : dropTarget(active, over, columns, cards);
        if (target === null) return;
        const id = Number(active.id);
        setDragCards((current) =>
            current === null || columnOf(current, id) === target.column
                ? current
                : moveCard(current, id, target.column, target.index),
        );
    }

    function end({ active, over }: DragEndEvent) {
        const from = origin.current;
        const target =
            over === null ? null : dropTarget(active, over, columns, cards);
        origin.current = null;
        setActiveId(null);
        setDragCards(null);
        if (from === null || target === null) return;
        const unchanged =
            target.column === from.column &&
            (!columnDef(target.column).ordered || target.index === from.index);
        if (!unchanged) onMove(Number(active.id), target.column, target.index);
    }

    function cancel() {
        origin.current = null;
        setActiveId(null);
        setDragCards(null);
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={findTarget}
            accessibility={{ announcements }}
            onDragStart={start}
            onDragOver={over}
            onDragEnd={end}
            onDragCancel={cancel}
        >
            <div
                className="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-4 px-6 pb-4"
                style={{
                    gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
                }}
            >
                {columns.map((column) => (
                    <BoardColumn
                        key={column.id}
                        column={column}
                        cards={shown[column.id]}
                        renderContent={renderContent}
                        renderActions={renderActions}
                        onOpen={onOpen}
                        loading={loading}
                    />
                ))}
            </div>
            {createPortal(
                <DragOverlay>
                    {activeCard &&
                        activeColumn !== null &&
                        renderCopy(activeCard, activeColumn)}
                </DragOverlay>,
                document.body,
            )}
        </DndContext>
    );
}
