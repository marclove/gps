import {
    COLUMNS,
    compareRanks,
    type Column,
    type InitiativeSummary,
} from "@/lib/initiatives";
import { columnOf } from "@/components/board/cards";

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

/**
 * Returns a board with only the cards of the project with the identifier `projectId`. The
 * cards keep their order. If `projectId` is `null`, the board has all cards.
 */
export function filterBoard(board: Board, projectId: number | null): Board {
    if (projectId === null) return board;
    const next = emptyBoard();
    for (const column of COLUMNS) {
        next[column.id] = board[column.id].filter(
            (card) => card.projectId === projectId,
        );
    }
    return next;
}

/**
 * Turns the place of a drop among the shown cards of a column into the index among all
 * cards of the column. `column` has all cards of the column, and `shown` has the cards that
 * the user sees, in the same order. `index` is the place of the drop among `shown`, counted
 * without the card `id`. The result is counted without the card `id` too. The card goes
 * directly after the shown card above the drop, if there is one. Otherwise it goes directly
 * before the shown card below the drop, if there is one. Otherwise it goes to the end of the
 * column.
 */
export function fullIndex(
    column: InitiativeSummary[],
    shown: InitiativeSummary[],
    id: number,
    index: number,
): number {
    const all = column.filter((card) => card.id !== id);
    const visible = shown.filter((card) => card.id !== id);
    const position = (card: InitiativeSummary) =>
        all.findIndex((candidate) => candidate.id === card.id);
    const place = Math.min(index, visible.length);
    if (place > 0) return position(visible[place - 1]) + 1;
    if (visible.length > 0) return position(visible[0]);
    return all.length;
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
