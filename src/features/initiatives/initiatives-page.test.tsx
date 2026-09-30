import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { DeleteProvider } from "@/components/delete-provider";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { COLUMNS, type Column } from "@/lib/initiatives";
import { FakeBackend } from "@/test/fake-backend";
import type { Board } from "./board";
import { InitiativesPage } from "./initiatives-page";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

// jsdom cannot drag, so a stub board shows the cards as text and has a button for each move
// that the tests make.
vi.mock("./roadmap-board", () => ({
    RoadmapBoard: ({
        board,
        onMove,
    }: {
        board: Board;
        onMove: (id: number, to: Column, index: number) => void;
    }) => (
        <div>
            {COLUMNS.map((column) => (
                <p key={column.id} data-testid={column.id}>
                    {board[column.id].map((card) => card.name).join(",")}
                </p>
            ))}
            <button type="button" onClick={() => onMove(1, "later", 0)}>
                Move A
            </button>
            <button type="button" onClick={() => onMove(2, "next", 0)}>
                Move B
            </button>
            <button type="button" onClick={() => onMove(1, "now", 1)}>
                Move A down
            </button>
        </div>
    ),
}));

let backend: FakeBackend;

/** A move that waits until the test settles it. */
type HeldMove = {
    args: Record<string, unknown>;
    succeed: () => void;
    fail: () => void;
};

let heldMoves: HeldMove[];

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    heldMoves = [];
    invoke.mockImplementation(
        (command: string, args: Record<string, unknown> = {}) => {
            if (command !== "move_initiative") {
                return backend.handle(command, args);
            }
            return new Promise((resolve, reject) => {
                heldMoves.push({
                    args,
                    succeed: () =>
                        resolve(backend.handle("move_initiative", args)),
                    fail: () => reject("database is locked"),
                });
            });
        },
    );
});

function renderPage() {
    render(
        <MemoryRouter>
            <Toaster toastManager={toast}>
                <FailureToastProvider>
                    <DeleteProvider>
                        <InitiativesPage />
                    </DeleteProvider>
                </FailureToastProvider>
            </Toaster>
        </MemoryRouter>,
    );
}

/** The names that the stub board shows in each column, from the top. */
function shownBoard(): Record<Column, string> {
    return {
        now: screen.getByTestId("now").textContent ?? "",
        next: screen.getByTestId("next").textContent ?? "",
        later: screen.getByTestId("later").textContent ?? "",
        done: screen.getByTestId("done").textContent ?? "",
    };
}

/** The names that the backend has in each column, from the top. */
function backendBoard(): Record<Column, string> {
    return {
        now: backend.column("now").join(","),
        next: backend.column("next").join(","),
        later: backend.column("later").join(","),
        done: backend.done().join(","),
    };
}

describe("InitiativesPage", () => {
    it("says that the projects could not be loaded when only they fail, and loads both again on Retry", async () => {
        backend.seedInitiative({ name: "A", horizon: "now" });
        const handle = invoke.getMockImplementation()!;
        invoke.mockImplementation(
            (command: string, args: Record<string, unknown> = {}) =>
                command === "list_projects"
                    ? Promise.reject(new Error("disk full"))
                    : handle(command, args),
        );
        const user = userEvent.setup();
        renderPage();

        expect(
            await screen.findByText("Couldn't load projects"),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Couldn't load initiatives"),
        ).not.toBeInTheDocument();

        invoke.mockImplementation(handle);
        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(shownBoard().now).toBe("A"));
        expect(
            screen.queryByText("Couldn't load projects"),
        ).not.toBeInTheDocument();
    });

    it("says that the initiatives could not be loaded when they fail", async () => {
        const handle = invoke.getMockImplementation()!;
        invoke.mockImplementation(
            (command: string, args: Record<string, unknown> = {}) =>
                command === "list_initiatives"
                    ? Promise.reject(new Error("disk full"))
                    : handle(command, args),
        );
        renderPage();

        expect(
            await screen.findByText("Couldn't load initiatives"),
        ).toBeInTheDocument();
    });

    it("shows the backend board after a failed move, also when a later move succeeded", async () => {
        backend.seedInitiative({ name: "A", horizon: "now" });
        backend.seedInitiative({ name: "B", horizon: "now" });
        backend.seedInitiative({ name: "C", horizon: "now" });
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(shownBoard().now).toBe("A,B,C"));

        await user.click(screen.getByRole("button", { name: "Move A" }));
        await user.click(screen.getByRole("button", { name: "Move B" }));
        expect(shownBoard()).toEqual({
            now: "C",
            next: "B",
            later: "A",
            done: "",
        });
        expect(heldMoves.map((move) => move.args)).toEqual([
            { id: 1, destination: "later", index: 0 },
            { id: 2, destination: "next", index: 0 },
        ]);

        // The first move fails while the second move still waits for the backend.
        await act(async () => heldMoves[0].fail());
        expect(
            await within(
                screen.getByRole("region", { name: "Notifications" }),
            ).findByText("Couldn't move the initiative. Try again."),
        ).toBeInTheDocument();
        await act(async () => heldMoves[1].succeed());

        await waitFor(() => expect(shownBoard()).toEqual(backendBoard()));
        expect(shownBoard()).toEqual({
            now: "A,C",
            next: "B",
            later: "",
            done: "",
        });
    });

    it("shows the backend board when a failed move answers after a later move succeeded", async () => {
        backend.seedInitiative({ name: "A", horizon: "now" });
        backend.seedInitiative({ name: "B", horizon: "now" });
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(shownBoard().now).toBe("A,B"));

        await user.click(screen.getByRole("button", { name: "Move A" }));
        await user.click(screen.getByRole("button", { name: "Move B" }));
        await act(async () => heldMoves[1].succeed());
        await act(async () => heldMoves[0].fail());

        await waitFor(() =>
            expect(shownBoard()).toEqual({
                now: "A",
                next: "B",
                later: "",
                done: "",
            }),
        );
        expect(shownBoard()).toEqual(backendBoard());
    });

    it("moves a card on a filtered board to the index among all cards of the column", async () => {
        const checkout = backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        for (const [name, project] of [
            ["C1", checkout],
            ["B1", billing],
            ["C2", checkout],
            ["B2", billing],
            ["C3", checkout],
        ] as const) {
            backend.seedInitiative({ name, horizon: "now", project });
        }
        const user = userEvent.setup();
        renderPage();
        const filter = screen.getByRole("combobox", { name: "Project" });
        await waitFor(() => expect(shownBoard().now).toBe("C1,B1,C2,B2,C3"));
        await user.selectOptions(filter, "Checkout");
        expect(shownBoard().now).toBe("C1,C2,C3");

        // The stub board drops C1 at the second place among the shown cards.
        await user.click(screen.getByRole("button", { name: "Move A down" }));

        expect(shownBoard().now).toBe("C2,C1,C3");
        expect(heldMoves.map((move) => move.args)).toEqual([
            { id: 1, destination: "now", index: 2 },
        ]);
        await act(async () => heldMoves[0].succeed());
        expect(backendBoard().now).toBe("B1,C2,C1,B2,C3");
    });
});
