import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import App from "@/App";
import { FakeBackend, type TaskStage } from "@/test/fake-backend";
import {
    center,
    dragWithPointer,
    nextFrame,
    pointer,
    waitForCardInColumn,
} from "@/test/pointer-drag";

// Feature spec for dragging cards and for the scrolling of the board of the Work page in
// docs/specs/0010-work-section.md.
// It runs in WebKit with the application's CSS, at the default window size of
// 1200 by 800 pixels. The Tauri backend is replaced by an in-memory fake.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeBackend;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    invoke.mockImplementation(backend.handle);
});

type ColumnName = "Current" | "Backlog" | "Icebox" | "Done";

const COLUMNS: ColumnName[] = ["Current", "Backlog", "Icebox", "Done"];

function sidebarLink(name: string) {
    return within(screen.getByRole("navigation", { name: "Main" })).getByRole(
        "link",
        { name },
    );
}

async function openWorkPage() {
    render(<App />);
    await userEvent.click(sidebarLink("Work"));
    await screen.findByRole("button", { name: "New task" });
    await waitFor(() =>
        expect(screen.queryByText("Couldn't load tasks")).toBeNull(),
    );
}

function column(name: ColumnName) {
    return screen.getByRole("region", { name: new RegExp(`^${name}`) });
}

/** The card buttons of the column, without the "Start" and "Reopen" buttons. */
function cards(name: ColumnName): HTMLElement[] {
    const region = column(name);
    const actions = within(region).queryAllByRole("button", {
        name: /^(Start|Reopen) "/,
    });
    return within(region)
        .queryAllByRole("button")
        .filter((button) => !actions.includes(button));
}

function cardTexts(name: ColumnName): string[] {
    return cards(name).map((card) => backend.cardText(card));
}

function card(title: string) {
    return screen.getByRole("button", { name: new RegExp(`^${title}\\b`) });
}

async function waitForCards(name: ColumnName, titles: string[]) {
    await waitFor(() => expect(cardTexts(name)).toEqual(titles));
}

function seed(stage: TaskStage, titles: string[]) {
    for (const title of titles) backend.seedTask({ title, stage });
}

function movedTask() {
    return invoke.mock.calls.some(([command]) => command === "move_task");
}

function positions(elements: Element[]) {
    return elements.map((element) => {
        const { top, bottom, left } = element.getBoundingClientRect();
        return { top, bottom, left };
    });
}

function isFullyVisible(element: Element) {
    const { top, bottom } = element.getBoundingClientRect();
    return top >= 0 && bottom <= window.innerHeight;
}

describe("Dragging cards with the pointer", () => {
    it("opens the sheet on a click without moving the card", async () => {
        seed("backlog", ["A", "B"]);
        await openWorkPage();
        await waitForCards("Backlog", ["A", "B"]);

        await userEvent.click(card("A"));

        expect(
            await screen.findByRole("dialog", { name: "A" }),
        ).toBeInTheDocument();
        expect(movedTask()).toBe(false);
        expect(backend.listOrder()).toEqual(["A", "B"]);
    });

    it("moves a card to another place in the Backlog", async () => {
        seed("backlog", ["A", "B", "C"]);
        await openWorkPage();
        await waitForCards("Backlog", ["A", "B", "C"]);

        await dragWithPointer(card("A"), card("C"));

        await waitForCards("Backlog", ["B", "C", "A"]);
        await waitFor(() =>
            expect(backend.workColumn("backlog")).toEqual(["B", "C", "A"]),
        );
    });

    it("starts a card dropped in Current, at the place where it is dropped", async () => {
        seed("current", ["C1", "C2", "C3"]);
        seed("backlog", ["B"]);
        await openWorkPage();
        await waitForCards("Backlog", ["B"]);

        await dragWithPointer(card("B"), card("C2"));

        await waitFor(() => expect(cardTexts("Current")).toHaveLength(4));
        const current = cardTexts("Current");
        expect(current[0]).toBe("C1");
        expect(current[3]).toBe("C3");
        expect(cardTexts("Backlog")).toEqual([]);
        await waitFor(() =>
            expect(backend.findTask("B").startedAt).not.toBeNull(),
        );
        expect(backend.workColumn("current")).toEqual(current);
    });

    it("no longer starts a card dropped in the Backlog, at the place where it is dropped", async () => {
        seed("current", ["C"]);
        seed("backlog", ["B1", "B2", "B3"]);
        await openWorkPage();
        await waitForCards("Current", ["C"]);

        await dragWithPointer(card("C"), card("B2"));

        await waitFor(() => expect(cardTexts("Backlog")).toHaveLength(4));
        const backlog = cardTexts("Backlog");
        expect(backlog[0]).toBe("B1");
        expect(backlog[3]).toBe("B3");
        expect(within(column("Current")).getByText("No tasks")).toBeVisible();
        await waitFor(() => expect(backend.findTask("C").startedAt).toBeNull());
        expect(backend.workColumn("backlog")).toEqual(backlog);
    });

    it("prioritizes a card dragged from the Icebox to the Backlog, at the place where it is dropped", async () => {
        seed("backlog", ["B1", "B2", "B3"]);
        seed("icebox", ["I"]);
        await openWorkPage();
        await waitForCards("Icebox", ["I"]);

        await dragWithPointer(card("I"), card("B2"));

        await waitFor(() => expect(cardTexts("Backlog")).toHaveLength(4));
        const backlog = cardTexts("Backlog");
        expect(backlog[0]).toBe("B1");
        expect(backlog[3]).toBe("B3");
        await waitFor(() => expect(backend.findTask("I").rank).not.toBeNull());
        expect(backend.findTask("I").startedAt).toBeNull();
        expect(backend.workColumn("backlog")).toEqual(backlog);
    });

    it("moves a card into an empty Current", async () => {
        seed("backlog", ["B"]);
        await openWorkPage();
        await waitForCards("Backlog", ["B"]);

        await dragWithPointer(
            card("B"),
            within(column("Current")).getByText("No tasks"),
        );

        await waitForCards("Current", ["B"]);
        expect(within(column("Backlog")).getByText("No tasks")).toBeVisible();
        await waitFor(() =>
            expect(backend.workColumn("current")).toEqual(["B"]),
        );
    });

    it("puts a card dropped in the Icebox at the place of its creation time, neither started nor prioritized", async () => {
        seed("icebox", ["Oldest"]);
        seed("current", ["C"]);
        seed("icebox", ["Newest"]);
        await openWorkPage();
        await waitForCards("Icebox", ["Newest", "Oldest"]);

        // Dropped on the top card, but it was created between the two.
        await dragWithPointer(card("C"), card("Newest"));

        await waitForCards("Icebox", ["Newest", "C", "Oldest"]);
        expect(within(column("Current")).getByText("No tasks")).toBeVisible();
        await waitFor(() =>
            expect(backend.stageOf(backend.findTask("C"))).toBe("icebox"),
        );
        expect(backend.findTask("C").rank).toBeNull();
        expect(backend.findTask("C").startedAt).toBeNull();
    });

    it.each([
        ["current", "Current"],
        ["backlog", "Backlog"],
        ["icebox", "Icebox"],
    ] as const)(
        "completes a card dropped in Done from %s, at the top of Done",
        async (stage, name) => {
            seed("done", ["Old win", "New win"]);
            seed(stage, ["A"]);
            const { rank, startedAt } = backend.findTask("A");
            await openWorkPage();
            await waitForCards(name, ["A"]);
            await waitForCards("Done", ["New win", "Old win"]);

            await dragWithPointer(card("A"), card("Old win"));

            await waitForCards("Done", ["A", "New win", "Old win"]);
            expect(cardTexts(name)).toEqual([]);
            await waitFor(() =>
                expect(backend.findTask("A").completedAt).not.toBeNull(),
            );
            expect(backend.findTask("A").rank).toBe(rank);
            expect(backend.findTask("A").startedAt).toBe(startedAt);
        },
    );

    it("does not change the order of the Icebox when a card is dragged inside it", async () => {
        seed("icebox", ["I1", "I2", "I3"]);
        await openWorkPage();
        await waitForCards("Icebox", ["I3", "I2", "I1"]);

        await dragWithPointer(card("I3"), card("I1"));

        await waitForCards("Icebox", ["I3", "I2", "I1"]);
        expect(backend.workColumn("icebox")).toEqual(["I3", "I2", "I1"]);
    });

    it("does not drag a card in Done", async () => {
        seed("backlog", ["B"]);
        seed("done", ["D"]);
        await openWorkPage();
        await waitForCards("Done", ["D"]);

        const start = center(card("D"));
        const end = center(card("B"));
        pointer("pointerdown", card("D"), start.x, start.y);
        for (let step = 1; step <= 10; step++) {
            pointer(
                "pointermove",
                document,
                start.x + ((end.x - start.x) * step) / 10,
                start.y + ((end.y - start.y) * step) / 10,
            );
            await nextFrame();
        }
        pointer("pointerup", document, end.x, end.y);
        for (let frame = 0; frame < 5; frame++) await nextFrame();

        expect(screen.queryByText(/^Picked up D/)).toBeNull();
        expect(screen.queryByText(/^D is in /)).toBeNull();
        expect(cardTexts("Done")).toEqual(["D"]);
        expect(cardTexts("Backlog")).toEqual(["B"]);
        expect(movedTask()).toBe(false);
    });

    it("puts the card back and shows a failure toast when the move cannot be saved", async () => {
        seed("backlog", ["A", "B", "C"]);
        backend.failing.add("move_task");
        await openWorkPage();
        await waitForCards("Backlog", ["A", "B", "C"]);

        await dragWithPointer(card("A"), card("C"));

        expect(
            await within(
                screen.getByRole("region", { name: "Notifications" }),
            ).findByText("Couldn't move the task. Try again."),
        ).toBeVisible();
        await waitForCards("Backlog", ["A", "B", "C"]);
    });

    it("keeps the new order when the page opens again", async () => {
        seed("backlog", ["A", "B", "C"]);
        await openWorkPage();
        await waitForCards("Backlog", ["A", "B", "C"]);
        await dragWithPointer(card("C"), card("A"));
        await waitFor(() => expect(backend.listOrder()[0]).toBe("C"));
        const order = backend.workColumn("backlog");

        await userEvent.click(sidebarLink("Meetings"));
        await userEvent.click(sidebarLink("Work"));

        await waitForCards("Backlog", order);
    });
});

describe("Dragging cards with the keyboard", () => {
    it("moves a card down the Backlog with Space, Down, and Space, and announces the drop", async () => {
        seed("backlog", ["A", "B", "C"]);
        await openWorkPage();
        await waitForCards("Backlog", ["A", "B", "C"]);

        card("A").focus();
        await userEvent.keyboard(" ");
        expect(await screen.findByText("Picked up A.")).toBeInTheDocument();
        await userEvent.keyboard("{ArrowDown}");
        expect(
            await screen.findByText("A is in Backlog, position 2 of 3."),
        ).toBeInTheDocument();
        await userEvent.keyboard(" ");

        await waitForCards("Backlog", ["B", "A", "C"]);
        expect(
            await screen.findByText("A was moved to Backlog, position 2 of 3."),
        ).toBeInTheDocument();
        expect(card("A")).toHaveFocus();
        await waitFor(() =>
            expect(backend.workColumn("backlog")).toEqual(["B", "A", "C"]),
        );
    });

    it("moves a card from the Backlog to Current with the Left arrow key, and starts it", async () => {
        seed("current", ["C"]);
        seed("backlog", ["A"]);
        await openWorkPage();
        await waitForCards("Backlog", ["A"]);

        card("A").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowLeft}");
        await waitForCardInColumn("Current");
        await userEvent.keyboard(" ");

        await waitFor(() => expect(cardTexts("Current")).toContain("A"));
        expect(cardTexts("Backlog")).toEqual([]);
        expect(card("A")).toHaveFocus();
        await waitFor(() =>
            expect(backend.findTask("A").startedAt).not.toBeNull(),
        );
        expect(backend.workColumn("current")).toEqual(cardTexts("Current"));
    });

    it("moves a card to the Icebox with the Right arrow key, and announces it", async () => {
        seed("backlog", ["A"]);
        await openWorkPage();
        await waitForCards("Backlog", ["A"]);

        card("A").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowRight}");
        await waitForCardInColumn("Icebox");
        await userEvent.keyboard(" ");

        await waitForCards("Icebox", ["A"]);
        expect(
            await screen.findByText("A was moved to Icebox."),
        ).toBeInTheDocument();
        await waitFor(() => expect(backend.findTask("A").rank).toBeNull());
    });

    it("completes a card moved to Done with the keyboard, and announces it", async () => {
        seed("icebox", ["A"]);
        await openWorkPage();
        await waitForCards("Icebox", ["A"]);

        card("A").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowRight}");
        await waitForCardInColumn("Done");
        await userEvent.keyboard(" ");

        await waitForCards("Done", ["A"]);
        expect(await screen.findByText("A was completed.")).toBeInTheDocument();
        await waitFor(() =>
            expect(backend.findTask("A").completedAt).not.toBeNull(),
        );
    });

    it("puts the card back with Escape, and announces it", async () => {
        seed("backlog", ["A", "B"]);
        await openWorkPage();
        await waitForCards("Backlog", ["A", "B"]);

        card("A").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowDown}");
        await userEvent.keyboard("{Escape}");

        expect(await screen.findByText("A was put back.")).toBeInTheDocument();
        await waitForCards("Backlog", ["A", "B"]);
        expect(movedTask()).toBe(false);
    });

    it("does not pick up a card in Done", async () => {
        seed("backlog", ["B"]);
        seed("done", ["D"]);
        await openWorkPage();
        await waitForCards("Done", ["D"]);

        card("D").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowLeft}");
        await userEvent.keyboard(" ");
        for (let frame = 0; frame < 5; frame++) await nextFrame();

        expect(screen.queryByText("Picked up D.")).toBeNull();
        expect(screen.queryByText(/^D is in /)).toBeNull();
        expect(cardTexts("Done")).toEqual(["D"]);
        expect(movedTask()).toBe(false);
    });
});

describe("The board", () => {
    it("scrolls only a long column, while the header, the column headings, and the Add task field stay in place", async () => {
        seed(
            "icebox",
            Array.from({ length: 60 }, (_, i) => `Task ${i + 1}`),
        );
        await openWorkPage();
        const icebox = column("Icebox");
        const newest = await within(icebox).findByRole("button", {
            name: /^Task 60\b/,
        });
        const oldest = within(icebox).getByRole("button", {
            name: /^Task 1\b/,
        });
        const chrome = [
            screen.getByRole("navigation", { name: "breadcrumb" }),
            screen.getByRole("button", { name: "New task" }),
            ...COLUMNS.map((name) => within(column(name)).getByRole("heading")),
            within(icebox).getByRole("textbox", { name: "Add task" }),
        ];
        const before = positions(chrome);

        await userEvent.wheel(newest, { delta: { y: 100000 } });
        await expect.poll(() => isFullyVisible(oldest)).toBe(true);

        expect(positions(chrome)).toEqual(before);
        expect(window.scrollY).toBe(0);
        expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
            window.innerHeight,
        );
    });
});
