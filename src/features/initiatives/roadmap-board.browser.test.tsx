import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import App from "@/App";
import { FakeRoadmapBackend, type Horizon } from "@/test/fake-roadmap-backend";

// Cases of dragging on the roadmap that the feature spec for
// docs/specs/0006-managing-initiatives.md does not cover. They run in WebKit with the
// application's CSS. The Tauri backend is replaced by an in-memory fake.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeRoadmapBackend;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeRoadmapBackend();
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
}

function column(name: ColumnName) {
    return screen.getByRole("region", { name });
}

function cardTexts(name: ColumnName): string[] {
    return within(column(name))
        .queryAllByRole("button")
        .map((card) => card.textContent ?? "");
}

function card(name: string) {
    return screen.getByRole("button", { name: new RegExp(`^${name}`) });
}

function seedColumn(horizon: Horizon, names: string[]) {
    for (const name of names) backend.seedInitiative({ name, horizon });
}

function center(element: Element) {
    const { left, top, width, height } = element.getBoundingClientRect();
    return { x: left + width / 2, y: top + height / 2 };
}

function pointer(type: string, target: EventTarget, x: number, y: number) {
    target.dispatchEvent(
        new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            isPrimary: true,
            pointerId: 1,
            pointerType: "mouse",
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: x,
            clientY: y,
        }),
    );
}

/** Returns a promise that resolves after the browser draws the next frame. */
function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
}

describe("Dragging cards", () => {
    it("keeps the focus on a card that the keyboard moves into another column", async () => {
        seedColumn("now", ["A"]);
        seedColumn("next", ["B", "C"]);
        await openInitiativesPage();
        await waitFor(() => expect(cardTexts("Next")).toEqual(["B", "C"]));

        card("A").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowRight}");
        await userEvent.keyboard(" ");

        await waitFor(() => expect(cardTexts("Next")).toContain("A"));
        expect(cardTexts("Now")).toEqual([]);
        await waitFor(() => expect(card("A")).toHaveFocus());
    });

    it("shows the dragged card over another column, not cut off by its own column", async () => {
        seedColumn("now", ["A"]);
        await openInitiativesPage();
        await waitFor(() => expect(cardTexts("Now")).toEqual(["A"]));
        const source = card("A");
        const start = center(source);
        const end = center(within(column("Later")).getByText("No initiatives"));

        pointer("pointerdown", source, start.x, start.y);
        for (let step = 1; step <= 10; step++) {
            pointer(
                "pointermove",
                document,
                start.x + ((end.x - start.x) * step) / 10,
                start.y + ((end.y - start.y) * step) / 10,
            );
            await nextFrame();
        }

        // The copy below the pointer is hidden from screen readers, so each initiative
        // still has exactly one button.
        const copies = [
            ...document.querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
        ].filter((element) => element.textContent === "A");
        expect(copies).toHaveLength(1);
        const copy = copies[0].getBoundingClientRect();
        const later = column("Later").getBoundingClientRect();
        expect(copy.left).toBeGreaterThanOrEqual(later.left - 1);
        expect(copy.right).toBeLessThanOrEqual(later.right + 1);
        expect(document.elementFromPoint(end.x, end.y)).toSatisfy(
            (element: Element | null) =>
                element !== null && copies[0].contains(element),
        );
        expect(screen.getAllByRole("button", { name: /^A/ })).toHaveLength(1);

        pointer("pointerup", document, end.x, end.y);

        await waitFor(() => expect(cardTexts("Later")).toEqual(["A"]));
        await waitFor(() => expect(backend.column("later")).toEqual(["A"]));
    });
});
