import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import App from "@/App";
import { FakeBackend, type Horizon } from "@/test/fake-backend";
import { dragWithPointer, waitForCardInColumn } from "@/test/pointer-drag";

// Feature spec for dragging cards and for the layout of the roadmap and the sheet in
// docs/specs/0006-managing-initiatives.md, with the changes of
// docs/specs/0008-projects.md.
// It runs in WebKit with the application's CSS, at the default window size of
// 1200 by 800 pixels. The Tauri backend is replaced by an in-memory fake.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeBackend;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    // Every initiative needs a project. When exactly one project exists, a draft starts in
    // it, so the specs of Spec 0006 create initiatives as before.
    backend.seedProject("Unsorted");
    invoke.mockImplementation(backend.handle);
});

type ColumnName = "Now" | "Next" | "Later" | "Done";

async function openInitiativesPage() {
    render(<App />);
    await userEvent.click(
        within(screen.getByRole("navigation", { name: "Main" })).getByRole(
            "link",
            { name: "Initiatives" },
        ),
    );
    await screen.findByRole("button", { name: "New initiative" });
    await waitFor(() =>
        expect(screen.queryByText("Couldn't load initiatives")).toBeNull(),
    );
}

function column(name: ColumnName) {
    return screen.getByRole("region", { name });
}

function cardTexts(name: ColumnName): string[] {
    return within(column(name))
        .queryAllByRole("button")
        .map((card) => backend.cardText(card));
}

function card(name: string) {
    return screen.getByRole("button", { name: new RegExp(`^${name}`) });
}

async function waitForCards(name: ColumnName, texts: string[]) {
    await waitFor(() => expect(cardTexts(name)).toEqual(texts));
}

/**
 * Drags with the pointer from `source` to `target`. The pointer moves in several
 * steps, as a person's pointer does, so that the board sees it pass over the cards.
 */
async function drag(source: Element, target: Element) {
    await dragWithPointer(source, target);
}

/**
 * Waits until the sheet has finished sliding in. The slide starts when the sheet drops its
 * `data-starting-style` attribute, which can take a while when the browser draws frames
 * slowly, and ends when its transitions finish.
 */
async function waitForSheetToArrive(sheet: HTMLElement) {
    await waitFor(
        () => expect(sheet).not.toHaveAttribute("data-starting-style"),
        { timeout: 10000 },
    );
    await Promise.all(
        sheet.getAnimations().map((animation) => animation.finished),
    );
}

function seedColumn(horizon: Horizon, names: string[]) {
    for (const name of names) backend.seedInitiative({ name, horizon });
}

function isFullyVisible(element: Element) {
    const { top, bottom } = element.getBoundingClientRect();
    return top >= 0 && bottom <= window.innerHeight;
}

function positions(elements: Element[]) {
    return elements.map((element) => {
        const { top, bottom, left } = element.getBoundingClientRect();
        return { top, bottom, left };
    });
}

function expectWindowNotScrolled() {
    expect(window.scrollY).toBe(0);
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
        window.innerHeight,
    );
}

async function scrollUntilVisible(element: Element, target: Element) {
    await userEvent.wheel(element, { delta: { y: 100000 } });
    await expect.poll(() => isFullyVisible(target)).toBe(true);
}

describe("Dragging cards with the pointer", () => {
    it("moves a card to another place in its column", async () => {
        seedColumn("now", ["A", "B", "C"]);
        await openInitiativesPage();
        await waitForCards("Now", ["A", "B", "C"]);

        await drag(card("A"), card("C"));

        await waitForCards("Now", ["B", "C", "A"]);
        await waitFor(() =>
            expect(backend.column("now")).toEqual(["B", "C", "A"]),
        );
    });

    it("moves a card to the place where it is dropped in another column", async () => {
        seedColumn("now", ["A", "B"]);
        seedColumn("later", ["X", "Y"]);
        await openInitiativesPage();
        await waitForCards("Later", ["X", "Y"]);

        await drag(card("Y"), card("B"));

        await waitFor(() => expect(cardTexts("Now")).toContain("Y"));
        expect(cardTexts("Later")).toEqual(["X"]);
        await waitFor(() =>
            expect(backend.column("now")).toEqual(cardTexts("Now")),
        );
        expect(backend.column("later")).toEqual(["X"]);
    });

    it("moves a card into an empty column", async () => {
        seedColumn("later", ["X"]);
        await openInitiativesPage();
        await waitForCards("Later", ["X"]);

        await drag(
            card("X"),
            within(column("Next")).getByText("No initiatives"),
        );

        await waitForCards("Next", ["X"]);
        expect(
            within(column("Later")).getByText("No initiatives"),
        ).toBeVisible();
        await waitFor(() => expect(backend.column("next")).toEqual(["X"]));
    });

    it("completes an initiative dropped in Done and puts it at the top of Done", async () => {
        backend.seedInitiative({ name: "Old win", completed: true });
        backend.seedInitiative({ name: "Older win", completed: true });
        seedColumn("now", ["A", "B"]);
        await openInitiativesPage();
        await waitForCards("Done", ["Older win", "Old win"]);

        await drag(card("A"), card("Old win"));

        await waitForCards("Done", ["A", "Older win", "Old win"]);
        expect(cardTexts("Now")).toEqual(["B"]);
        await waitFor(() =>
            expect(backend.find("A").completedAt).not.toBeNull(),
        );
        expect(backend.column("now")).toEqual(["B"]);
    });

    it("does not change the order of Done when a card is dragged inside Done", async () => {
        backend.seedInitiative({ name: "Old win", completed: true });
        backend.seedInitiative({ name: "New win", completed: true });
        await openInitiativesPage();
        await waitForCards("Done", ["New win", "Old win"]);

        await drag(card("New win"), card("Old win"));

        await waitForCards("Done", ["New win", "Old win"]);
    });

    it("reopens an initiative dragged out of Done, at the place where it is dropped", async () => {
        backend.seedInitiative({ name: "Won", completed: true });
        seedColumn("next", ["A", "B"]);
        await openInitiativesPage();
        await waitForCards("Done", ["Won"]);

        await drag(card("Won"), card("A"));

        await waitFor(() => expect(cardTexts("Next")).toContain("Won"));
        expect(cardTexts("Done")).toEqual([]);
        await waitFor(() => expect(backend.find("Won").completedAt).toBeNull());
        expect(backend.column("next")).toEqual(cardTexts("Next"));
    });

    it("opens the sheet on a click without moving the card", async () => {
        seedColumn("now", ["A", "B"]);
        await openInitiativesPage();
        await waitForCards("Now", ["A", "B"]);

        await userEvent.click(card("A"));

        expect(
            await screen.findByRole("dialog", { name: "A" }),
        ).toBeInTheDocument();
        expect(invoke).not.toHaveBeenCalledWith(
            "move_initiative",
            expect.anything(),
        );
    });

    it("puts the card back and shows a failure toast when the move cannot be saved", async () => {
        seedColumn("now", ["A", "B", "C"]);
        backend.failing.add("move_initiative");
        await openInitiativesPage();
        await waitForCards("Now", ["A", "B", "C"]);

        await drag(card("A"), card("C"));

        expect(
            await within(
                screen.getByRole("region", { name: "Notifications" }),
            ).findByText("Couldn't move the initiative. Try again."),
        ).toBeVisible();
        await waitForCards("Now", ["A", "B", "C"]);
    });

    it("keeps the new order when the page opens again", async () => {
        seedColumn("now", ["A", "B", "C"]);
        await openInitiativesPage();
        await waitForCards("Now", ["A", "B", "C"]);
        await drag(card("C"), card("A"));
        await waitFor(() => expect(backend.column("now")[0]).toBe("C"));
        const order = backend.column("now");

        await userEvent.click(
            within(screen.getByRole("navigation", { name: "Main" })).getByRole(
                "link",
                { name: "Meetings" },
            ),
        );
        await userEvent.click(
            within(screen.getByRole("navigation", { name: "Main" })).getByRole(
                "link",
                { name: "Initiatives" },
            ),
        );

        await waitForCards("Now", order);
    });
});

describe("Dragging cards with the keyboard", () => {
    it("moves a card down its column with Space, Down, and Space, and announces the drop", async () => {
        seedColumn("next", ["A", "B", "C"]);
        await openInitiativesPage();
        await waitForCards("Next", ["A", "B", "C"]);

        card("A").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowDown}");
        expect(
            await screen.findByText("A is in Next, position 2 of 3."),
        ).toBeInTheDocument();
        await userEvent.keyboard(" ");

        await waitForCards("Next", ["B", "A", "C"]);
        expect(
            await screen.findByText("A was moved to Next, position 2 of 3."),
        ).toBeInTheDocument();
        expect(card("A")).toHaveFocus();
        await waitFor(() =>
            expect(backend.column("next")).toEqual(["B", "A", "C"]),
        );
    });

    it("moves a card to the column at the right with the Right arrow key", async () => {
        seedColumn("now", ["A"]);
        seedColumn("next", ["B"]);
        await openInitiativesPage();
        await waitForCards("Now", ["A"]);

        card("A").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowRight}");
        await waitForCardInColumn("Next");
        await userEvent.keyboard(" ");

        await waitFor(() => expect(cardTexts("Next")).toContain("A"));
        expect(cardTexts("Now")).toEqual([]);
        await waitFor(() =>
            expect(backend.column("next")).toEqual(cardTexts("Next")),
        );
    });

    it("completes an initiative moved to Done with the keyboard, and announces it", async () => {
        seedColumn("later", ["A"]);
        await openInitiativesPage();
        await waitForCards("Later", ["A"]);

        card("A").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowRight}");
        await waitForCardInColumn("Done");
        await userEvent.keyboard(" ");

        await waitForCards("Done", ["A"]);
        expect(await screen.findByText("A was completed.")).toBeInTheDocument();
        await waitFor(() =>
            expect(backend.find("A").completedAt).not.toBeNull(),
        );
    });

    it("puts the card back with Escape, and announces it", async () => {
        seedColumn("now", ["A", "B"]);
        await openInitiativesPage();
        await waitForCards("Now", ["A", "B"]);

        card("A").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowDown}");
        await userEvent.keyboard("{Escape}");

        expect(await screen.findByText("A was put back.")).toBeInTheDocument();
        await waitForCards("Now", ["A", "B"]);
        expect(invoke).not.toHaveBeenCalledWith(
            "move_initiative",
            expect.anything(),
        );
    });
});

describe("Layout", () => {
    it("shows four columns of equal width side by side", async () => {
        seedColumn("now", ["A"]);
        await openInitiativesPage();
        await waitForCards("Now", ["A"]);

        const rects = (["Now", "Next", "Later", "Done"] as const).map((name) =>
            column(name).getBoundingClientRect(),
        );
        for (let i = 1; i < rects.length; i++) {
            expect(rects[i].left).toBeGreaterThanOrEqual(rects[i - 1].right);
            expect(
                Math.abs(rects[i].width - rects[0].width),
            ).toBeLessThanOrEqual(1);
            expect(rects[i].top).toBe(rects[0].top);
        }
    });

    it("scrolls only a long column, while the header and the column headings stay in place", async () => {
        seedColumn(
            "later",
            Array.from({ length: 60 }, (_, i) => `Initiative ${i + 1}`),
        );
        await openInitiativesPage();
        const first = await within(column("Later")).findByRole("button", {
            // The card also shows its project after the name.
            name: /^Initiative 1(?!\d)/,
        });
        const last = within(column("Later")).getByRole("button", {
            name: /^Initiative 60(?!\d)/,
        });
        const chrome = [
            screen.getByRole("navigation", { name: "breadcrumb" }),
            screen.getByRole("button", { name: "New initiative" }),
            ...(["Now", "Next", "Later", "Done"] as const).map((name) =>
                within(column(name)).getByRole("heading"),
            ),
        ];
        const before = positions(chrome);

        await scrollUntilVisible(first, last);

        expect(positions(chrome)).toEqual(before);
        expectWindowNotScrolled();
    });

    it("shows the sheet at the right, as tall as the window and 40rem wide", async () => {
        seedColumn("now", ["A"]);
        await openInitiativesPage();

        await userEvent.click(
            await screen.findByRole("button", { name: /^A/ }),
        );

        const dialog = await screen.findByRole("dialog", { name: "A" });
        await waitForSheetToArrive(dialog);
        expect(dialog.getBoundingClientRect().right).toBe(window.innerWidth);
        const sheet = dialog.getBoundingClientRect();
        expect(sheet.top).toBe(0);
        expect(sheet.bottom).toBe(window.innerHeight);
        expect(Math.round(sheet.width)).toBe(640);
    });

    it("scrolls only a long description in the sheet", async () => {
        backend.seedInitiative({
            name: "A",
            horizon: "now",
            description: Array.from(
                { length: 150 },
                (_, i) => `Paragraph ${i + 1}`,
            ).join("\n\n"),
        });
        await openInitiativesPage();
        await userEvent.click(
            await screen.findByRole("button", { name: /^A/ }),
        );
        const sheet = await screen.findByRole("dialog", { name: "A" });
        await waitForSheetToArrive(sheet);
        // The sheet slides in from the right, so wait until it has arrived.
        await expect
            .poll(() => sheet.getBoundingClientRect().right)
            .toBe(window.innerWidth);
        const description = await within(sheet).findByRole("textbox", {
            name: "Description",
        });
        await within(description).findByText("Paragraph 150");
        const chrome = [
            within(sheet).getByRole("textbox", { name: "Initiative name" }),
            within(sheet).getByRole("combobox", { name: "RACI role" }),
            within(sheet).getByRole("toolbar", { name: "Formatting" }),
            within(sheet).getByRole("button", { name: "Delete" }),
        ];
        const before = positions(chrome);

        await scrollUntilVisible(
            within(description).getByText("Paragraph 1"),
            within(description).getByText("Paragraph 150"),
        );

        expect(positions(chrome)).toEqual(before);
        for (const element of chrome)
            expect(isFullyVisible(element)).toBe(true);
        expectWindowNotScrolled();
    });
});
