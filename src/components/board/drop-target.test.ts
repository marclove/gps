import type { Active, Over, UniqueIdentifier } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { dropTarget, type BoardColumnDef } from "./drop-target";

type Column = "now" | "next" | "later" | "done";
type Card = { id: number };

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

const cards: Record<Column, Card[]> = {
    now: [{ id: 1 }, { id: 2 }],
    next: [],
    later: [],
    done: [{ id: 3 }],
};

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

describe("dropTarget", () => {
    it("keeps the place of the card over its own list area", () => {
        expect(
            dropTarget(active(2), overList("now", [1, 2, 3]), columns, cards),
        ).toEqual({
            column: "now",
            index: 1,
            count: 3,
        });
    });

    it("keeps the place of a card in Done", () => {
        expect(
            dropTarget(
                active(3),
                overCard(2, "done", 0, [2, 3]),
                columns,
                cards,
            ),
        ).toEqual({
            column: "done",
            index: 1,
            count: 2,
        });
    });

    it("returns null for a target that is not a column or a card", () => {
        expect(
            dropTarget(
                active(1),
                {
                    id: "other",
                    rect: {
                        width: 0,
                        height: 0,
                        top: 0,
                        left: 0,
                        bottom: 0,
                        right: 0,
                    },
                    disabled: false,
                    data: { current: undefined },
                },
                columns,
                cards,
            ),
        ).toBeNull();
    });
});
