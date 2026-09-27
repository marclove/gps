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
});
