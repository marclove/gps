import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import App from "@/App";
import tauriConfig from "../../src-tauri/tauri.conf.json";

// Feature spec for docs/specs/0003-compact-section-nav.md, for the parts that
// depend on layout. It runs in WebKit with the application's CSS, at the default
// window size of 1200 by 800 pixels. The Tauri backend is replaced by a fake with
// no meetings.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(async () => {
    await page.viewport(1200, 800);
    invoke.mockReset();
    invoke.mockImplementation(async (command: string) => {
        if (command === "list_meetings") return [];
        throw `unexpected command ${command}`;
    });
});

/** The width of the icons, 48 pixels, and the border at the right side. */
const MAX_NAVIGATION_WIDTH = 49;

function navigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

function pageHeader() {
    const header = screen
        .getByRole("navigation", { name: "breadcrumb" })
        .closest("header");
    if (!header) throw new Error("The breadcrumb is not in a header");
    return header;
}

async function renderApp() {
    render(<App />);
    await screen.findByText("No meetings yet");
}

function expectCompactNavigation() {
    const nav = navigation().getBoundingClientRect();
    const link = within(navigation())
        .getByRole("link", { name: "Meetings" })
        .getBoundingClientRect();

    expect(nav.left).toBe(0);
    expect(nav.right).toBeLessThanOrEqual(MAX_NAVIGATION_WIDTH);
    expect(link.right).toBeLessThanOrEqual(MAX_NAVIGATION_WIDTH);
    expect(pageHeader().getBoundingClientRect().left).toBeLessThanOrEqual(
        MAX_NAVIGATION_WIDTH,
    );
}

describe("Compact navigation between sections", () => {
    it("takes only as much width as its icons need", async () => {
        await renderApp();

        expectCompactNavigation();
    });

    it("keeps the same width at the minimum window size", async () => {
        await page.viewport(900, 600);
        await renderApp();

        expectCompactNavigation();
    });

    it("stays in place when the user presses Ctrl+Cmd+S", async () => {
        await renderApp();
        const headerLeft = pageHeader().getBoundingClientRect().left;

        await userEvent.keyboard("{Control>}{Meta>}s{/Meta}{/Control}");
        // Give a transition time to start, if the shortcut did anything.
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(navigation()).toBeVisible();
        expect(pageHeader().getBoundingClientRect().left).toBe(headerLeft);
        expectCompactNavigation();
    });
});

/** Converts any CSS color that the browser can draw to `#rrggbb`. */
function toHex(color: string) {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("The canvas has no 2D context");
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

describe("Window", () => {
    it("gives the title bar the color of the navigation's border", async () => {
        await renderApp();
        const sidebar = navigation().closest('[data-slot="sidebar"]');
        if (!sidebar) throw new Error("The navigation is not in the sidebar");

        const [mainWindow] = tauriConfig.app.windows;
        expect(toHex(getComputedStyle(sidebar).borderRightColor)).toBe(
            mainWindow.backgroundColor,
        );
    });
});
