import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import App from "@/App";

// Feature spec for the layout of docs/specs/0006-managing-initiatives.md.
// It runs in WebKit with the application's CSS, at the default window size of
// 1200 by 800 pixels. The Tauri backend is replaced by an in-memory fake.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

type Initiative = {
    id: number;
    name: string;
    description: string;
    raciRole: string | null;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
};

let initiatives: Initiative[];

function seed(name: string, description = "") {
    const createdAt = new Date(
        Date.UTC(2026, 8, 24, 10, 0, initiatives.length),
    ).toISOString();
    initiatives.push({
        id: initiatives.length + 1,
        name,
        description,
        raciRole: null,
        createdAt,
        updatedAt: createdAt,
        archivedAt: null,
    });
}

async function handle(command: string, args: Record<string, unknown> = {}) {
    switch (command) {
        case "list_meetings":
            return [];
        case "list_initiatives":
            return [...initiatives]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map(({ id, name, raciRole, updatedAt, archivedAt }) => ({
                    id,
                    name,
                    raciRole,
                    updatedAt,
                    archivedAt,
                }));
        case "get_initiative":
            return initiatives.find((i) => i.id === args.id) ?? null;
        case "update_initiative": {
            const initiative = initiatives.find((i) => i.id === args.id);
            if (!initiative) throw `initiative ${String(args.id)} not found`;
            Object.assign(initiative, args);
            return initiative;
        }
        default:
            throw `unexpected command ${command}`;
    }
}

beforeEach(() => {
    initiatives = [];
    invoke.mockReset();
    invoke.mockImplementation(handle);
});

/** Markdown with `count` paragraphs, "Paragraph 1" to "Paragraph <count>". */
function longText(count: number) {
    return Array.from({ length: count }, (_, i) => `Paragraph ${i + 1}`).join(
        "\n\n",
    );
}

async function openInitiativesPage() {
    render(<App />);
    await userEvent.click(
        within(screen.getByRole("navigation", { name: "Main" })).getByRole(
            "link",
            { name: "Initiatives" },
        ),
    );
    await screen.findByRole("heading", { level: 1, name: "Initiatives" });
}

function positions(elements: Element[]) {
    return elements.map((element) => {
        const { top, bottom } = element.getBoundingClientRect();
        return { top, bottom };
    });
}

function isFullyVisible(element: Element) {
    const { top, bottom } = element.getBoundingClientRect();
    return top >= 0 && bottom <= window.innerHeight;
}

function expectWindowNotScrolled() {
    expect(window.scrollY).toBe(0);
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
        window.innerHeight,
    );
}

/** Scrolls with the mouse wheel over `element` until `target` is fully visible. */
async function scrollUntilVisible(element: Element, target: Element) {
    await userEvent.wheel(element, { delta: { y: 100000 } });
    await expect.poll(() => isFullyVisible(target)).toBe(true);
}

describe("Initiative editor page with a long description", () => {
    it("scrolls the description while the header, name, toolbar, and sidebar stay in place", async () => {
        seed("Launch", longText(150));
        await openInitiativesPage();
        await userEvent.click(
            await screen.findByRole("link", { name: /^Launch/ }),
        );
        const description = await screen.findByRole("textbox", {
            name: "Description",
        });
        const sidebar = screen.getByRole("complementary", {
            name: "Initiative details",
        });
        const chrome = [
            screen.getByRole("navigation", { name: "breadcrumb" }),
            screen.getByRole("textbox", { name: "Initiative name" }),
            screen.getByRole("toolbar", { name: "Formatting" }),
            within(sidebar).getByRole("combobox", { name: "RACI role" }),
            within(sidebar).getByRole("button", { name: "Archive" }),
        ];
        const before = positions(chrome);

        await scrollUntilVisible(
            within(description).getByText("Paragraph 1"),
            within(description).getByText("Paragraph 150"),
        );

        expect(positions(chrome)).toEqual(before);
        for (const element of chrome) {
            expect(isFullyVisible(element)).toBe(true);
        }
        expectWindowNotScrolled();
    });

    it("shows the sidebar at the right, from the top to the bottom of the main area", async () => {
        seed("Launch");
        await openInitiativesPage();
        await userEvent.click(
            await screen.findByRole("link", { name: /^Launch/ }),
        );
        await screen.findByRole("textbox", { name: "Description" });

        const sidebar = screen
            .getByRole("complementary", { name: "Initiative details" })
            .getBoundingClientRect();
        const breadcrumb = screen
            .getByRole("navigation", { name: "breadcrumb" })
            .getBoundingClientRect();

        expect(sidebar.top).toBe(0);
        expect(sidebar.bottom).toBe(window.innerHeight);
        expect(sidebar.left).toBeGreaterThan(breadcrumb.right);
        // 11rem + 11vw at 1200 pixels is 176 + 132 = 308 pixels, as for meetings.
        expect(Math.round(sidebar.width)).toBeGreaterThanOrEqual(304);
        expect(Math.round(sidebar.width)).toBeLessThanOrEqual(312);
    });
});

describe("Initiatives page with many initiatives", () => {
    it("scrolls only the list while the header and title stay in place", async () => {
        for (let i = 1; i <= 60; i++) seed(`Initiative ${i}`);
        await openInitiativesPage();
        const first = await screen.findByRole("link", {
            name: /^Initiative 60$/,
        });
        const last = screen.getByRole("link", { name: /^Initiative 1$/ });
        const chrome = [
            screen.getByRole("navigation", { name: "breadcrumb" }),
            screen.getByRole("button", { name: "New initiative" }),
            screen.getByRole("heading", { level: 1, name: "Initiatives" }),
        ];
        const before = positions(chrome);

        await scrollUntilVisible(first, last);

        expect(positions(chrome)).toEqual(before);
        expectWindowNotScrolled();
    });
});
