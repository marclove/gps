import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import App from "@/App";
import {
    FakeBackend,
    type Horizon,
    type StoredProject,
} from "@/test/fake-backend";
import { waitForCardInColumn } from "@/test/pointer-drag";

// Feature spec for dragging cards on a roadmap that is filtered to one project in
// docs/specs/0008-projects.md.
// It runs in WebKit with the application's CSS, at the default window size of 1200 by 800
// pixels. The Tauri backend is replaced by an in-memory fake.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeBackend;
let checkout: StoredProject;
let billing: StoredProject;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    checkout = backend.seedProject("Checkout");
    billing = backend.seedProject("Billing");
    invoke.mockImplementation(backend.handle);
});

type ColumnName = "Now" | "Next" | "Later" | "Done";

/**
 * Seeds the initiatives of a column, from the top. A name that starts with "C" is in the
 * project Checkout, and a name that starts with "B" is in the project Billing.
 */
function seedColumn(horizon: Horizon, names: string[]) {
    for (const name of names) {
        backend.seedInitiative({
            name,
            horizon,
            project: name.startsWith("C") ? checkout : billing,
        });
    }
}

/** Opens the Initiatives page and filters the roadmap to Checkout. */
async function openFilteredRoadmap() {
    render(<App />);
    await userEvent.click(
        within(screen.getByRole("navigation", { name: "Main" })).getByRole(
            "link",
            { name: "Initiatives" },
        ),
    );
    const filter = await screen.findByRole("combobox", { name: "Project" });
    await waitFor(() =>
        expect(
            Array.from((filter as HTMLSelectElement).options).map(
                (option) => option.text,
            ),
        ).toContain("Checkout"),
    );
    await userEvent.selectOptions(filter, "Checkout");
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

describe("Dragging cards on a filtered roadmap", () => {
    it("puts a card moved up directly after the shown card above it, and announces the shown positions", async () => {
        seedColumn("now", ["C1", "B1", "C2", "B2", "C3"]);
        await openFilteredRoadmap();
        await waitForCards("Now", ["C1", "C2", "C3"]);

        card("C3").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowUp}");
        expect(
            await screen.findByText("C3 is in Now, position 2 of 3."),
        ).toBeInTheDocument();
        await userEvent.keyboard(" ");

        await waitForCards("Now", ["C1", "C3", "C2"]);
        expect(
            await screen.findByText("C3 was moved to Now, position 2 of 3."),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(backend.column("now")).toEqual([
                "C1",
                "C3",
                "B1",
                "C2",
                "B2",
            ]),
        );
    });

    it("puts a card moved down directly after the shown card above it", async () => {
        seedColumn("now", ["C1", "B1", "C2", "B2", "C3"]);
        await openFilteredRoadmap();
        await waitForCards("Now", ["C1", "C2", "C3"]);

        card("C1").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowDown}");
        await userEvent.keyboard(" ");

        await waitForCards("Now", ["C2", "C1", "C3"]);
        await waitFor(() =>
            expect(backend.column("now")).toEqual([
                "B1",
                "C2",
                "C1",
                "B2",
                "C3",
            ]),
        );
    });

    it("puts a card moved to the top directly before the shown card below it", async () => {
        seedColumn("now", ["B0", "C1", "B1", "C2", "B2", "C3"]);
        await openFilteredRoadmap();
        await waitForCards("Now", ["C1", "C2", "C3"]);

        card("C2").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard(" ");

        await waitForCards("Now", ["C2", "C1", "C3"]);
        await waitFor(() =>
            expect(backend.column("now")).toEqual([
                "B0",
                "C2",
                "C1",
                "B1",
                "B2",
                "C3",
            ]),
        );
    });

    it("puts a card at the end of a column that shows no other card", async () => {
        seedColumn("now", ["C1"]);
        seedColumn("next", ["B1", "B2"]);
        await openFilteredRoadmap();
        await waitForCards("Now", ["C1"]);
        await waitForCards("Next", []);

        card("C1").focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowRight}");
        await waitForCardInColumn("Next");
        await userEvent.keyboard(" ");

        await waitForCards("Next", ["C1"]);
        await waitFor(() =>
            expect(backend.column("next")).toEqual(["B1", "B2", "C1"]),
        );
        expect(backend.column("now")).toEqual([]);
    });
});
