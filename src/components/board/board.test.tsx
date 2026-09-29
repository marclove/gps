import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Board, type BoardColumnDef, type BoardMessages } from "./board";

type Column = "open" | "closed";
type Card = { id: number; title: string };

const columns: BoardColumnDef<Card, Column>[] = [
    {
        id: "open",
        title: "Open",
        ordered: true,
        draggable: true,
        emptyText: "No cards",
    },
    {
        id: "closed",
        title: "Closed",
        ordered: false,
        draggable: false,
        emptyText: "No cards",
        sortedIndex: () => 0,
    },
];

const messages: BoardMessages<Card, Column> = {
    pickedUp: (card) => `Picked up ${card.title}.`,
    over: (card, column, position, count) =>
        `${card.title} is in ${column.title}, position ${position} of ${count}.`,
    dropped: (card, column, position, count) =>
        `${card.title} was moved to ${column.title}, position ${position} of ${count}.`,
    putBack: (card) => `${card.title} was put back.`,
};

function renderBoard({
    onMove = vi.fn(),
    renderActions,
}: {
    onMove?: (id: number, column: Column, index: number) => void;
    renderActions?: (card: Card, column: Column) => ReactNode;
} = {}) {
    render(
        <Board
            columns={columns}
            cards={{
                open: [{ id: 1, title: "A" }],
                closed: [{ id: 2, title: "B" }],
            }}
            renderContent={(card) => card.title}
            renderCopy={(card) => card.title}
            renderActions={renderActions}
            messages={messages}
            onOpen={() => {}}
            onMove={onMove}
            loading={false}
        />,
    );
}

/** The live region in which dnd-kit announces the messages for screen readers. */
function liveRegion() {
    return screen.getByRole("status");
}

describe("Board", () => {
    it("picks up a card in a column that is draggable", async () => {
        const user = userEvent.setup();
        renderBoard();

        within(screen.getByRole("region", { name: "Open" }))
            .getByRole("button", { name: "A" })
            .focus();
        await user.keyboard(" ");

        await waitFor(() =>
            expect(liveRegion()).toHaveTextContent("Picked up A."),
        );
    });

    it("does not pick up a card in a column that is not draggable", async () => {
        const user = userEvent.setup();
        const onMove = vi.fn();
        renderBoard({ onMove });

        within(screen.getByRole("region", { name: "Closed" }))
            .getByRole("button", { name: "B" })
            .focus();
        await user.keyboard(" ");
        await user.keyboard("{ArrowLeft}");
        await user.keyboard(" ");

        expect(liveRegion().textContent).toBe("");
        expect(onMove).not.toHaveBeenCalled();
    });

    it("renders the actions of a card beside its open button", () => {
        renderBoard({
            renderActions: (card) => (
                <button type="button">{`Start "${card.title}"`}</button>
            ),
        });

        const open = screen.getByRole("button", { name: "A" });
        const action = screen.getByRole("button", { name: 'Start "A"' });
        expect(open).not.toContainElement(action);
        expect(action).not.toContainElement(open);
        expect(open.closest("[data-card-id]")).toBe(
            action.closest("[data-card-id]"),
        );
        expect(open.closest("[data-card-id]")).toHaveAttribute(
            "data-card-id",
            "1",
        );
    });
});
