import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { DeleteProvider } from "@/components/delete-provider";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import type { Task, TaskStage } from "@/lib/tasks";
import { FakeBackend } from "@/test/fake-backend";
import { WorkPage } from "./work-page";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const STAGES: TaskStage[] = ["current", "backlog", "icebox", "done"];

// jsdom cannot drag, so a stub board shows each card as its title and its rank, and has a
// button for each move that the tests make.
vi.mock("@/components/board/board", () => ({
    Board: ({
        cards,
        onMove,
    }: {
        cards: Record<TaskStage, Task[]>;
        onMove: (id: number, column: TaskStage, index: number) => void;
    }) => (
        <div>
            {STAGES.map((stage) => (
                <p key={stage} data-testid={stage}>
                    {cards[stage]
                        .map((card) => `${card.title}@${card.rank ?? "-"}`)
                        .join(",")}
                </p>
            ))}
            <button type="button" onClick={() => onMove(1, "backlog", 0)}>
                Move A
            </button>
            <button type="button" onClick={() => onMove(2, "current", 0)}>
                Move B
            </button>
        </div>
    ),
}));

let backend: FakeBackend;

/** A command that waits until the test settles it. */
type HeldCall = {
    command: string;
    args: Record<string, unknown>;
    succeed: () => void;
    fail: () => void;
};

let held: HeldCall[];
// The commands that wait until the test settles them.
let holding: Set<string>;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    held = [];
    holding = new Set(["move_task"]);
    invoke.mockImplementation(
        (command: string, args: Record<string, unknown> = {}) => {
            if (!holding.has(command)) return backend.handle(command, args);
            return new Promise((resolve, reject) => {
                held.push({
                    command,
                    args,
                    succeed: () => resolve(backend.handle(command, args)),
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
                        <WorkPage />
                    </DeleteProvider>
                </FailureToastProvider>
            </Toaster>
        </MemoryRouter>,
    );
}

/** The titles that the stub board shows in the column, from the top. */
function titles(stage: TaskStage): string[] {
    const text = screen.getByTestId(stage).textContent ?? "";
    return text === "" ? [] : text.split(",").map((card) => card.split("@")[0]);
}

/** The ranks that the stub board shows in the column, from the top. */
function ranks(stage: TaskStage): string[] {
    const text = screen.getByTestId(stage).textContent ?? "";
    return text === "" ? [] : text.split(",").map((card) => card.split("@")[1]);
}

function listCalls(): number {
    return invoke.mock.calls.filter(([command]) => command === "list_tasks")
        .length;
}

function heldMoves(): HeldCall[] {
    return held.filter((call) => call.command === "move_task");
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

describe("WorkPage", () => {
    it("moves the card at once and replaces it with the answer of move_task", async () => {
        backend.seedTask({ title: "A" });
        backend.seedTask({ title: "C", stage: "backlog" });
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(titles("icebox")).toEqual(["A"]));

        await user.click(screen.getByRole("button", { name: "Move A" }));

        expect(titles("backlog")).toEqual(["A", "C"]);
        expect(titles("icebox")).toEqual([]);
        expect(ranks("backlog")[0]).toBe("-");
        expect(heldMoves().map((call) => call.args)).toEqual([
            { id: 1, destination: "backlog", index: 0 },
        ]);

        await act(async () => heldMoves()[0].succeed());

        const rank = backend.findTask("A").rank;
        expect(rank).not.toBeNull();
        await waitFor(() => expect(ranks("backlog")[0]).toBe(rank));
        expect(titles("backlog")).toEqual(["A", "C"]);
        expect(listCalls()).toBe(1);
    });

    it("reloads once after a failed move when no other move is waiting", async () => {
        backend.seedTask({ title: "A", stage: "current" });
        backend.seedTask({ title: "B", stage: "backlog" });
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(titles("current")).toEqual(["A"]));

        await user.click(screen.getByRole("button", { name: "Move A" }));
        await user.click(screen.getByRole("button", { name: "Move B" }));
        expect(titles("current")).toEqual(["B"]);
        expect(titles("backlog")).toEqual(["A"]);

        // The first move fails while the second move still waits for the backend.
        await act(async () => heldMoves()[0].fail());
        expect(
            await within(notifications()).findByText(
                "Couldn't move the task. Try again.",
            ),
        ).toBeInTheDocument();
        expect(listCalls()).toBe(1);
        expect(titles("current")).toEqual(["B"]);

        await act(async () => heldMoves()[1].succeed());

        await waitFor(() => expect(listCalls()).toBe(2));
        // A stayed in Current, and B was started directly above it.
        await waitFor(() => expect(titles("current")).toEqual(["B", "A"]));
        expect(titles("current")).toEqual(backend.workColumn("current"));
        expect(titles("backlog")).toEqual([]);
        expect(listCalls()).toBe(2);
    });

    it("does not show a list that arrives after a move started", async () => {
        backend.seedTask({ title: "A", stage: "current" });
        backend.seedTask({ title: "B", stage: "backlog" });
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(titles("current")).toEqual(["A"]));

        // A failed move loads the tasks again, and the list waits for the backend.
        holding.add("list_tasks");
        await user.click(screen.getByRole("button", { name: "Move A" }));
        await act(async () => heldMoves()[0].fail());
        await waitFor(() =>
            expect(
                held.filter((call) => call.command === "list_tasks"),
            ).toHaveLength(1),
        );
        const staleList = held.find((call) => call.command === "list_tasks")!;

        // A second move starts before the list arrives.
        await user.click(screen.getByRole("button", { name: "Move B" }));
        expect(titles("current")).toEqual(["B"]);
        await act(async () => staleList.succeed());

        expect(titles("current")).toEqual(["B"]);
        expect(titles("backlog")).toEqual(["A"]);

        holding.delete("list_tasks");
        await act(async () => heldMoves()[1].succeed());

        await waitFor(() => expect(titles("current")).toEqual(["B", "A"]));
        expect(titles("current")).toEqual(backend.workColumn("current"));
    });
});
