import {
    Board,
    type BoardColumnDef,
    type BoardMessages,
} from "@/components/board/board";
import {
    COLUMNS,
    initiativeDisplayName,
    type Column,
    type InitiativeSummary,
} from "@/lib/initiatives";
import type { Board as RoadmapCards } from "./board";
import { InitiativeCardContent, InitiativeCardCopy } from "./initiative-card";

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

/**
 * The roadmap: four columns of equal width, Now, Next, Later, and Done, from left to right.
 * The board fills the height that it gets, and each column scrolls its own list of cards.
 * While `loading` is true, the columns show their headings and no cards. Each card shows the
 * name that `projectName` gives for its project.
 *
 * The user drags a card with the pointer, or with the keyboard: Space picks the card up and
 * drops it, the arrow keys move it, and Escape puts it back. While a card is dragged over
 * another column, the board shows it in that column. A card dragged into Done shows first in
 * Done, and a drag inside Done changes nothing. When a card drops at a new place, the board
 * calls `onMove` with the identifier, the column, and the index of the card in that column,
 * counted without the card. The board then shows `board` again, so the page must move the
 * card in `board` when `onMove` is called.
 */
export function RoadmapBoard({
    board,
    projectName,
    onOpen,
    onMove,
    loading = false,
}: {
    board: RoadmapCards;
    projectName: (projectId: number) => string;
    onOpen: (id: number) => void;
    onMove: (id: number, to: Column, index: number) => void;
    loading?: boolean;
}) {
    return (
        <Board
            columns={ROADMAP_COLUMNS}
            cards={board}
            renderContent={(card, column) => (
                <InitiativeCardContent
                    initiative={card}
                    projectName={projectName(card.projectId)}
                    done={column === "done"}
                />
            )}
            renderCopy={(card, column) => (
                <InitiativeCardCopy
                    initiative={card}
                    projectName={projectName(card.projectId)}
                    column={column}
                />
            )}
            messages={ROADMAP_MESSAGES}
            onOpen={onOpen}
            onMove={onMove}
            loading={loading}
        />
    );
}
