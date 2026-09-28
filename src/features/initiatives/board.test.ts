import { describe, expect, it } from "vitest";
import type { Column, InitiativeSummary } from "@/lib/initiatives";
import {
    addCard,
    buildBoard,
    columnOf,
    filterBoard,
    fullIndex,
    moveCard,
    removeCard,
    replaceCard,
    type Board,
} from "./board";

function summary(
    id: number,
    fields: Partial<InitiativeSummary> = {},
): InitiativeSummary {
    return {
        id,
        projectId: 1,
        name: `Initiative ${id}`,
        raciRole: null,
        horizon: "now",
        rank: "8",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
        completedAt: null,
        deletedAt: null,
        ...fields,
    };
}

function ids(board: Board): Record<Column, number[]> {
    return {
        now: board.now.map((card) => card.id),
        next: board.next.map((card) => card.id),
        later: board.later.map((card) => card.id),
        done: board.done.map((card) => card.id),
    };
}

/** A board with 1 and 2 in Now, 3 in Next, nothing in Later, and 5 then 4 in Done. */
function sampleBoard(): Board {
    return buildBoard([
        summary(1, { horizon: "now", rank: "4" }),
        summary(2, { horizon: "now", rank: "8" }),
        summary(3, { horizon: "next", rank: "4" }),
        summary(4, { completedAt: "2026-09-02T00:00:00Z" }),
        summary(5, { completedAt: "2026-09-03T00:00:00Z" }),
    ]);
}

describe("buildBoard", () => {
    it("puts each initiative that is not completed in the column of its horizon", () => {
        const board = buildBoard([
            summary(1, { horizon: "later" }),
            summary(2, { horizon: "now" }),
            summary(3, { horizon: "next" }),
        ]);

        expect(ids(board)).toEqual({
            now: [2],
            next: [3],
            later: [1],
            done: [],
        });
    });

    it("orders Now, Next, and Later by rank as text", () => {
        const board = buildBoard([
            summary(1, { horizon: "later", rank: "c" }),
            summary(2, { horizon: "later", rank: "4" }),
            summary(3, { horizon: "later", rank: "81f" }),
        ]);

        expect(board.later.map((card) => card.id)).toEqual([2, 3, 1]);
    });

    it("orders cards with the same rank by identifier", () => {
        const board = buildBoard([
            summary(3, { horizon: "next", rank: "4" }),
            summary(1, { horizon: "next", rank: "4" }),
            summary(2, { horizon: "next", rank: "4" }),
        ]);

        expect(board.next.map((card) => card.id)).toEqual([1, 2, 3]);
    });

    it("puts completed initiatives in Done, the one completed last first", () => {
        const board = buildBoard([
            summary(1, {
                horizon: "now",
                completedAt: "2026-09-01T00:00:00Z",
            }),
            summary(2, {
                horizon: "later",
                completedAt: "2026-09-03T00:00:00Z",
            }),
            summary(3, {
                horizon: "next",
                completedAt: "2026-09-02T00:00:00Z",
            }),
        ]);

        expect(ids(board)).toEqual({
            now: [],
            next: [],
            later: [],
            done: [2, 3, 1],
        });
    });

    it("orders cards of Done with the same time of completion by identifier, the largest first", () => {
        const completedAt = "2026-09-02T00:00:00Z";
        const board = buildBoard([
            summary(1, { completedAt }),
            summary(3, { completedAt }),
            summary(2, { completedAt }),
        ]);

        expect(board.done.map((card) => card.id)).toEqual([3, 2, 1]);
    });
});

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
        const board = buildBoard([
            summary(1, { horizon: "now", rank: "4" }),
            summary(2, { horizon: "now", rank: "8" }),
            summary(3, { horizon: "now", rank: "c" }),
        ]);

        expect(moveCard(board, 1, "now", 2).now.map((c) => c.id)).toEqual([
            2, 3, 1,
        ]);
    });

    it("moves a card up in its column", () => {
        const board = buildBoard([
            summary(1, { horizon: "now", rank: "4" }),
            summary(2, { horizon: "now", rank: "8" }),
            summary(3, { horizon: "now", rank: "c" }),
        ]);

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

    it("puts a card moved to Done first and ignores the index", () => {
        const moved = moveCard(sampleBoard(), 1, "done", 2);

        expect(ids(moved)).toEqual({
            now: [2],
            next: [3],
            later: [],
            done: [1, 5, 4],
        });
    });

    it("leaves Done unchanged when a card moves inside Done", () => {
        const board = sampleBoard();

        const moved = moveCard(board, 5, "done", 1);

        expect(ids(moved)).toEqual(ids(board));
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

describe("addCard", () => {
    it("puts the card at the top of Later and keeps the other cards", () => {
        const withSix = addCard(
            sampleBoard(),
            summary(6, { horizon: "later", rank: "4" }),
        );
        const board = addCard(
            withSix,
            summary(7, { horizon: "later", rank: "4" }),
        );

        expect(ids(board)).toEqual({
            now: [1, 2],
            next: [3],
            later: [7, 6],
            done: [5, 4],
        });
    });

    it("returns the same board when a column already holds the card", () => {
        const board = sampleBoard();

        expect(addCard(board, summary(3, { name: "Launch" }))).toBe(board);
    });

    it("does not change the board that it gets", () => {
        const board = sampleBoard();

        addCard(board, summary(6, { horizon: "later" }));

        expect(board.later).toEqual([]);
    });
});

describe("replaceCard", () => {
    it("replaces the card and keeps its place", () => {
        const renamed = summary(1, { name: "Launch", rank: "4" });

        const board = replaceCard(sampleBoard(), renamed);

        expect(ids(board).now).toEqual([1, 2]);
        expect(board.now[0].name).toBe("Launch");
    });

    it("returns the same board when no column holds the card", () => {
        const board = sampleBoard();

        expect(replaceCard(board, summary(99))).toBe(board);
    });
});

describe("removeCard", () => {
    it("removes the card and keeps the order of the others", () => {
        const board = removeCard(sampleBoard(), 5);

        expect(ids(board)).toEqual({
            now: [1, 2],
            next: [3],
            later: [],
            done: [4],
        });
    });

    it("returns the same board when no column holds the card", () => {
        const board = sampleBoard();

        expect(removeCard(board, 99)).toBe(board);
    });
});

describe("filterBoard", () => {
    it("keeps only the cards of the project in each column, in order", () => {
        const board = buildBoard([
            summary(1, { horizon: "now", rank: "1", projectId: 1 }),
            summary(2, { horizon: "now", rank: "2", projectId: 2 }),
            summary(3, { horizon: "now", rank: "3", projectId: 1 }),
            summary(4, { horizon: "next", projectId: 2 }),
            summary(5, { horizon: "later", projectId: 1 }),
            summary(6, { completedAt: "2026-09-02T00:00:00Z", projectId: 1 }),
            summary(7, { completedAt: "2026-09-03T00:00:00Z", projectId: 2 }),
        ]);

        expect(ids(filterBoard(board, 1))).toEqual({
            now: [1, 3],
            next: [],
            later: [5],
            done: [6],
        });
    });

    it("returns all cards when no project is chosen", () => {
        const board = sampleBoard();

        expect(ids(filterBoard(board, null))).toEqual(ids(board));
    });
});

describe("fullIndex", () => {
    /** The cards with the names, which start with C in project 1 and with B in project 2. */
    function cards(names: string[]): InitiativeSummary[] {
        return names.map((name) =>
            summary(Number(name.slice(1)) + (name.startsWith("C") ? 0 : 100), {
                name,
                projectId: name.startsWith("C") ? 1 : 2,
            }),
        );
    }

    function card(column: InitiativeSummary[], name: string): number {
        return column.find((candidate) => candidate.name === name)!.id;
    }

    function shownOf(column: InitiativeSummary[]): InitiativeSummary[] {
        return column.filter((candidate) => candidate.projectId === 1);
    }

    it("puts a card moved up directly after the shown card above the drop", () => {
        const column = cards(["C1", "B1", "C2", "B2", "C3"]);

        expect(fullIndex(column, shownOf(column), card(column, "C3"), 1)).toBe(
            1,
        );
    });

    it("puts a card moved down directly after the shown card above the drop", () => {
        const column = cards(["C1", "B1", "C2", "B2", "C3"]);

        expect(fullIndex(column, shownOf(column), card(column, "C1"), 1)).toBe(
            2,
        );
    });

    it("puts a card dropped at the top directly before the shown card below the drop", () => {
        const column = cards(["B0", "C1", "B1", "C2", "B2", "C3"]);

        expect(fullIndex(column, shownOf(column), card(column, "C2"), 0)).toBe(
            1,
        );
    });

    it("puts a card at the end of a column that shows no other card", () => {
        const column = cards(["B1", "B2"]);

        expect(fullIndex(column, [], 1, 0)).toBe(2);
    });

    it("does not count the dragged card when it sits above the neighbors of the drop", () => {
        const column = cards(["C1", "C2", "B1", "C3"]);

        expect(fullIndex(column, shownOf(column), card(column, "C1"), 1)).toBe(
            1,
        );
    });
});
