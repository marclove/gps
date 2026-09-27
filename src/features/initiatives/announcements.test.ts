import type { Active, Over, UniqueIdentifier } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import type { Column } from "@/lib/initiatives";
import { announcements, dropTarget } from "./announcements";

const names: Record<number, string> = { 1: "A", 2: "B", 3: "C", 4: "" };

const messages = announcements((id) => names[id as number] ?? "");

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

    it("says that the card was put back after a cancel or a drop outside the columns", () => {
        expect(messages.onDragCancel({ active: active(1), over: null })).toBe(
            "A was put back.",
        );
        expect(messages.onDragEnd({ active: active(1), over: null })).toBe(
            "A was put back.",
        );
    });

    it("says nothing while the card is over no column", () => {
        expect(
            messages.onDragOver({ active: active(1), over: null }),
        ).toBeUndefined();
    });
});

describe("dropTarget", () => {
    it("keeps the place of the card over its own list area", () => {
        expect(dropTarget(active(2), overList("now", [1, 2, 3]))).toEqual({
            column: "now",
            index: 1,
            count: 3,
        });
    });

    it("keeps the place of a card in Done", () => {
        expect(dropTarget(active(3), overCard(2, "done", 0, [2, 3]))).toEqual({
            column: "done",
            index: 1,
            count: 2,
        });
    });

    it("returns null for a target that is not a column or a card", () => {
        expect(
            dropTarget(active(1), {
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
            }),
        ).toBeNull();
    });
});
