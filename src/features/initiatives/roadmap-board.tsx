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
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CardPointerSensor } from "@/components/board/card-pointer-sensor";
import {
    boardAnnouncements,
    type BoardMessages,
} from "@/components/board/announcements";
import { columnOf, moveCard } from "@/components/board/cards";
import {
    dropTarget,
    type BoardColumnDef,
} from "@/components/board/drop-target";
import {
    COLUMNS,
    initiativeDisplayName,
    type Column,
    type InitiativeSummary,
} from "@/lib/initiatives";
import type { Board } from "./board";
import { InitiativeCardCopy } from "./initiative-card";
import { RoadmapColumn } from "./roadmap-column";

/**
 * The columns of the roadmap. The user orders Now, Next, and Later. Done is sorted by the time
 * of completion, so a card from another column goes first in Done.
 */
const ROADMAP_COLUMNS: BoardColumnDef<InitiativeSummary, Column>[] =
    COLUMNS.map((column) => ({
        ...column,
        ordered: column.id !== "done",
        draggable: true,
        emptyText: "No initiatives",
        sortedIndex: column.id === "done" ? () => 0 : undefined,
    }));

function shownName(initiative: InitiativeSummary): string {
    return initiativeDisplayName(initiative.name);
}

/** The messages that screen readers announce while a card of the roadmap is dragged. */
const ROADMAP_MESSAGES: BoardMessages<InitiativeSummary, Column> = {
    pickedUp: (card) => `Picked up ${shownName(card)}.`,
    over: (card, column, position, count) =>
        `${shownName(card)} is in ${column.title}, position ${position} of ${count}.`,
    dropped: (card, column, position, count) =>
        column.id === "done"
            ? `${shownName(card)} was completed.`
            : `${shownName(card)} was moved to ${column.title}, position ${position} of ${count}.`,
    putBack: (card) => `${shownName(card)} was put back.`,
};

/** The column and the index of a card, counted from 0. */
type Place = { column: Column; index: number };

function columnDef(id: Column): BoardColumnDef<InitiativeSummary, Column> {
    return ROADMAP_COLUMNS.find((column) => column.id === id)!;
}

function placeOf(board: Board, id: number): Place | null {
    const column = columnOf(board, id);
    if (column === null) return null;
    return {
        column,
        index: board[column].findIndex((card) => card.id === id),
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
 * The roadmap: four columns of equal width, Now, Next, Later, and Done, from left to right.
 * The board fills the height that it gets, and each column scrolls its own list of cards.
 * While `loading` is true, the columns show their headings and no cards. Each card shows the
 * name that `projectName` gives for its project.
 *
 * The user drags a card with the pointer, or with the keyboard: Space picks the card up and
 * drops it, the arrow keys move it, and Escape puts it back. While a card is dragged over
 * another column, the board shows it in that column. While a card is dragged, the board draws
 * a copy of it below the pointer, above the columns, because the scrolling list of a column
 * would cut off the card itself at the edge of the column. When a card drops at a new place, the
 * board calls `onMove` with the identifier, the column, and the index of the card in that
 * column, counted without the card. The board then shows `board` again, so the page must
 * move the card in `board` when `onMove` is called.
 */
export function RoadmapBoard({
    board,
    projectName,
    onOpen,
    onMove,
    loading = false,
}: {
    board: Board;
    projectName: (projectId: number) => string;
    onOpen: (id: number) => void;
    onMove: (id: number, to: Column, index: number) => void;
    loading?: boolean;
}) {
    // The board while a card is dragged, with the card in the column that it is over.
    const [dragBoard, setDragBoard] = useState<Board | null>(null);
    // The place of the dragged card before the drag.
    const origin = useRef<Place | null>(null);
    // The identifier of the dragged card.
    const [activeId, setActiveId] = useState<number | null>(null);
    const shown = dragBoard ?? board;
    const activePlace = activeId === null ? null : placeOf(shown, activeId);
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
    const messages = useMemo(
        () => boardAnnouncements(ROADMAP_COLUMNS, board, ROADMAP_MESSAGES),
        [board],
    );

    function start({ active }: DragStartEvent) {
        origin.current = placeOf(board, Number(active.id));
        setActiveId(Number(active.id));
        setDragBoard(board);
    }

    function over({ active, over }: DragOverEvent) {
        const target =
            over === null
                ? null
                : dropTarget(active, over, ROADMAP_COLUMNS, board);
        if (target === null) return;
        const id = Number(active.id);
        setDragBoard((current) =>
            current === null || columnOf(current, id) === target.column
                ? current
                : moveCard(current, id, target.column, target.index),
        );
    }

    function end({ active, over }: DragEndEvent) {
        const from = origin.current;
        const target =
            over === null
                ? null
                : dropTarget(active, over, ROADMAP_COLUMNS, board);
        origin.current = null;
        setActiveId(null);
        setDragBoard(null);
        if (from === null || target === null) return;
        const unchanged =
            target.column === from.column &&
            (!columnDef(target.column).ordered || target.index === from.index);
        if (!unchanged) onMove(Number(active.id), target.column, target.index);
    }

    function cancel() {
        origin.current = null;
        setActiveId(null);
        setDragBoard(null);
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={findTarget}
            accessibility={{ announcements: messages }}
            onDragStart={start}
            onDragOver={over}
            onDragEnd={end}
            onDragCancel={cancel}
        >
            <div className="grid min-h-0 grid-cols-4 grid-rows-[minmax(0,1fr)] gap-4 px-6 pb-4">
                {COLUMNS.map((column) => (
                    <RoadmapColumn
                        key={column.id}
                        column={column}
                        cards={shown[column.id]}
                        projectName={projectName}
                        onOpen={onOpen}
                        loading={loading}
                    />
                ))}
            </div>
            {createPortal(
                <DragOverlay>
                    {activePlace && (
                        <InitiativeCardCopy
                            initiative={
                                shown[activePlace.column][activePlace.index]
                            }
                            projectName={projectName(
                                shown[activePlace.column][activePlace.index]
                                    .projectId,
                            )}
                            column={activePlace.column}
                        />
                    )}
                </DragOverlay>,
                document.body,
            )}
        </DndContext>
    );
}
