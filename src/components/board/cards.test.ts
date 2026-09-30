import { describe, expect, it } from "vitest";
import { columnOf, moveCard } from "./cards";

type Column = "now" | "next" | "later" | "done";
type Cards = Record<Column, { id: number }[]>;

function cards(ids: Record<Column, number[]>): Cards {
    return {
        now: ids.now.map((id) => ({ id })),
        next: ids.next.map((id) => ({ id })),
        later: ids.later.map((id) => ({ id })),
        done: ids.done.map((id) => ({ id })),
    };
}

function ids(board: Cards): Record<Column, number[]> {
    return {
        now: board.now.map((card) => card.id),
        next: board.next.map((card) => card.id),
        later: board.later.map((card) => card.id),
        done: board.done.map((card) => card.id),
    };
}

/** A board with 1 and 2 in Now, 3 in Next, nothing in Later, and 5 then 4 in Done. */
function sampleBoard(): Cards {
    return cards({ now: [1, 2], next: [3], later: [], done: [5, 4] });
}

describe("columnOf", () => {
    it("returns the column that holds the card", () => {
        const board = sampleBoard();

        expect(columnOf(board, 2)).toBe("now");
        expect(columnOf(board, 3)).toBe("next");
        expect(columnOf(board, 4)).toBe("done");
    });

    it("returns null when no column holds the card", () => {
        expect(columnOf(sampleBoard(), 99)).toBeNull();
    });
});

describe("moveCard", () => {
    it("moves a card down in its column", () => {
        const board = cards({ now: [1, 2, 3], next: [], later: [], done: [] });

        expect(moveCard(board, 1, "now", 2).now.map((c) => c.id)).toEqual([
            2, 3, 1,
        ]);
    });

    it("moves a card up in its column", () => {
        const board = cards({ now: [1, 2, 3], next: [], later: [], done: [] });

        expect(moveCard(board, 3, "now", 0).now.map((c) => c.id)).toEqual([
            3, 1, 2,
        ]);
    });

    it("moves a card to the given place in another column", () => {
        const moved = moveCard(sampleBoard(), 2, "next", 0);

        expect(ids(moved)).toEqual({
            now: [1],
            next: [2, 3],
            later: [],
            done: [5, 4],
        });
    });

    it("moves a card into an empty column", () => {
        const moved = moveCard(sampleBoard(), 1, "later", 0);

        expect(ids(moved).later).toEqual([1]);
        expect(ids(moved).now).toEqual([2]);
    });

    it("puts a card at the end when the index is larger than the column", () => {
        const moved = moveCard(sampleBoard(), 3, "now", 10);

        expect(ids(moved).now).toEqual([1, 2, 3]);
    });

    it("moves a card from Done to another column", () => {
        const moved = moveCard(sampleBoard(), 4, "next", 1);

        expect(ids(moved)).toEqual({
            now: [1, 2],
            next: [3, 4],
            later: [],
            done: [5],
        });
    });

    it("returns the same board when no column holds the card", () => {
        const board = sampleBoard();

        expect(moveCard(board, 99, "now", 0)).toBe(board);
    });

    it("does not change the board that it gets", () => {
        const board = sampleBoard();
        const before = ids(board);

        moveCard(board, 1, "later", 0);

        expect(ids(board)).toEqual(before);
    });
});
