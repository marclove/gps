import type { Active, Over, UniqueIdentifier } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { boardAnnouncements, type BoardMessages } from "./announcements";
import type { BoardColumnDef } from "./drop-target";

type Column = "now" | "next" | "later" | "done";
type Card = { id: number; name: string };

const columns: BoardColumnDef<Card, Column>[] = [
    { id: "now", title: "Now", ordered: true, draggable: true, emptyText: "" },
    {
        id: "next",
        title: "Next",
        ordered: true,
        draggable: true,
        emptyText: "",
    },
    {
        id: "later",
        title: "Later",
        ordered: true,
        draggable: true,
        emptyText: "",
    },
    {
        id: "done",
        title: "Done",
        ordered: false,
        draggable: true,
        emptyText: "",
        sortedIndex: () => 0,
    },
];

// The cards of the board before the drag: A in Now, C in Next, a card without a name in
// Later, and B in Done.
const cards: Record<Column, Card[]> = {
    now: [{ id: 1, name: "A" }],
    next: [{ id: 3, name: "C" }],
    later: [{ id: 4, name: "" }],
    done: [{ id: 2, name: "B" }],
};

const name = (card: Card) =>
    card.name.trim() === "" ? "Untitled initiative" : card.name;

const words: BoardMessages<Card, Column> = {
    pickedUp: (card) => `Picked up ${name(card)}.`,
    over: (card, column, position, count) =>
        `${name(card)} is in ${column.title}, position ${position} of ${count}.`,
    dropped: (card, column, position, count) =>
        column.id === "done"
            ? `${name(card)} was completed.`
            : `${name(card)} was moved to ${column.title}, position ${position} of ${count}.`,
    putBack: (card) => `${name(card)} was put back.`,
};

const messages = boardAnnouncements(columns, cards, words);

function active(id: number): Active {
    return {
        id,
        data: { current: undefined },
        rect: { current: { initial: null, translated: null } },
    };
}

/** A card under the dragged card, at `index` in the column `column` with the cards `items`. */
function overCard(
    id: number,
    column: Column,
    index: number,
    items: UniqueIdentifier[],
): Over {
    return {
        id,
        rect: { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 },
        disabled: false,
        data: {
            current: { sortable: { containerId: column, index, items } },
        },
    };
}

/** The list area of the column `column`, with the cards `items`. */
function overList(column: Column, items: UniqueIdentifier[]): Over {
    return {
        id: column,
        rect: { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 },
        disabled: false,
        data: { current: { column, items } },
    };
}

describe("announcements", () => {
    it("says that the card was picked up", () => {
        expect(messages.onDragStart({ active: active(1) })).toBe(
            "Picked up A.",
        );
    });

    it("uses the default name for a card with an empty name", () => {
        expect(messages.onDragStart({ active: active(4) })).toBe(
            "Picked up Untitled initiative.",
        );
    });

    it("says where the card is over another card of its column", () => {
        expect(
            messages.onDragOver({
                active: active(1),
                over: overCard(2, "next", 1, [1, 2, 3]),
            }),
        ).toBe("A is in Next, position 2 of 3.");
    });

    it("counts the card in a column that does not hold it yet", () => {
        expect(
            messages.onDragOver({
                active: active(1),
                over: overCard(2, "later", 0, [2, 3]),
            }),
        ).toBe("A is in Later, position 1 of 3.");
    });

    it("puts the card at the end of a list area that does not hold it", () => {
        expect(
            messages.onDragOver({
                active: active(1),
                over: overList("now", [2, 3]),
            }),
        ).toBe("A is in Now, position 3 of 3.");
        expect(
            messages.onDragOver({
                active: active(1),
                over: overList("now", []),
            }),
        ).toBe("A is in Now, position 1 of 1.");
    });

    it("puts the card first in Done", () => {
        expect(
            messages.onDragOver({
                active: active(1),
                over: overCard(3, "done", 1, [2, 3]),
            }),
        ).toBe("A is in Done, position 1 of 3.");
    });

    it("says where the card was moved to", () => {
        expect(
            messages.onDragEnd({
                active: active(1),
                over: overCard(2, "next", 1, [1, 2, 3]),
            }),
        ).toBe("A was moved to Next, position 2 of 3.");
    });

    it("says that a card dropped in Done was completed", () => {
        expect(
            messages.onDragEnd({
                active: active(1),
                over: overCard(2, "done", 0, [1, 2]),
            }),
        ).toBe("A was completed.");
        expect(
            messages.onDragEnd({
                active: active(1),
                over: overList("done", []),
            }),
        ).toBe("A was completed.");
    });

    it("says that a card of Done dropped in Done was put back", () => {
        expect(
            messages.onDragEnd({
                active: active(2),
                over: overCard(1, "done", 0, [1, 2]),
            }),
        ).toBe("B was put back.");
        expect(
            messages.onDragEnd({
                active: active(2),
                over: overList("done", [2]),
            }),
        ).toBe("B was put back.");
    });

    it("says that the card was put back after a cancel or a drop outside the columns", () => {
        expect(messages.onDragCancel({ active: active(1), over: null })).toBe(
            "A was put back.",
        );
        expect(messages.onDragEnd({ active: active(1), over: null })).toBe(
            "A was put back.",
        );
    });

    it("keeps the message of the pick up while the card is over its own place", () => {
        const drag = boardAnnouncements(columns, cards, words);
        drag.onDragStart({ active: active(1) });

        // dnd-kit finds the card under itself as soon as it is picked up.
        expect(
            drag.onDragOver({
                active: active(1),
                over: overCard(1, "now", 0, [1]),
            }),
        ).toBeUndefined();
        expect(
            drag.onDragOver({
                active: active(1),
                over: overList("next", [3]),
            }),
        ).toBe("A is in Next, position 2 of 2.");
        expect(
            drag.onDragOver({
                active: active(1),
                over: overCard(1, "now", 0, [1]),
            }),
        ).toBe("A is in Now, position 1 of 1.");
    });

    it("says nothing while the card is over no column", () => {
        expect(
            messages.onDragOver({ active: active(1), over: null }),
        ).toBeUndefined();
    });
});
