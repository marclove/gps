import {
    COLUMNS,
    compareRanks,
    type Column,
    type InitiativeSummary,
} from "@/lib/initiatives";

/** The cards of the roadmap, in each column from the top. */
export type Board = Record<Column, InitiativeSummary[]>;

/** Returns a board with no cards. */
export function emptyBoard(): Board {
    return { now: [], next: [], later: [], done: [] };
}

/**
 * Makes the board from the initiative summaries. A completed initiative goes into Done, and
 * another initiative goes into the column of its horizon. Now, Next, and Later are sorted by
 * rank and then by identifier. Done is sorted by the time of completion, the initiative
 * completed last first, and then by identifier, the largest first.
 */
export function buildBoard(summaries: InitiativeSummary[]): Board {
    const board = emptyBoard();
    for (const summary of summaries) {
        board[summary.completedAt === null ? summary.horizon : "done"].push(
            summary,
        );
    }
    for (const column of ["now", "next", "later"] as const) {
        board[column].sort(
            (a, b) => compareRanks(a.rank, b.rank) || a.id - b.id,
        );
    }
    // RFC 3339 timestamps in UTC sort correctly as text.
    board.done.sort(
        (a, b) =>
            (b.completedAt ?? "").localeCompare(a.completedAt ?? "") ||
            b.id - a.id,
    );
    return board;
}

/** Returns the column that holds the card with the identifier, or `null` if no column holds it. */
export function columnOf(board: Board, id: number): Column | null {
    return (
        COLUMNS.find((column) =>
            board[column.id].some((card) => card.id === id),
        )?.id ?? null
    );
}

/**
 * Returns a board with the card moved to the column `to`, at the place `index` in that
 * column, counted without the card. An index larger than the column puts the card at the end.
 * A card moved to Done goes first in Done, and the index has no effect. A move inside Done
 * does not change the board. If no column holds the card, the function returns the board that
 * it gets.
 */
export function moveCard(
    board: Board,
    id: number,
    to: Column,
    index: number,
): Board {
    const from = columnOf(board, id);
    if (from === null || (from === "done" && to === "done")) return board;
    const card = board[from].find((candidate) => candidate.id === id)!;
    const next: Board = {
        ...board,
        [from]: board[from].filter((candidate) => candidate.id !== id),
    };
    const destination = [...next[to]];
    destination.splice(to === "done" ? 0 : index, 0, card);
    next[to] = destination;
    return next;
}

/**
 * Returns a board with the card of `summary` at the top of Later. If a column already holds a
 * card with the identifier of `summary`, the function returns the board that it gets.
 */
export function addCard(board: Board, summary: InitiativeSummary): Board {
    if (columnOf(board, summary.id) !== null) return board;
    return { ...board, later: [summary, ...board.later] };
}

/**
 * Returns a board with the card that has the identifier of `summary` replaced by `summary`, at
 * the same place. If no column holds the card, the function returns the board that it gets.
 */
export function replaceCard(board: Board, summary: InitiativeSummary): Board {
    const column = columnOf(board, summary.id);
    if (column === null) return board;
    return {
        ...board,
        [column]: board[column].map((card) =>
            card.id === summary.id ? summary : card,
        ),
    };
}

/**
 * Returns a board without the card with the identifier. The other cards keep their order. If
 * no column holds the card, the function returns the board that it gets.
 */
export function removeCard(board: Board, id: number): Board {
    const column = columnOf(board, id);
    if (column === null) return board;
    return {
        ...board,
        [column]: board[column].filter((card) => card.id !== id),
    };
}
