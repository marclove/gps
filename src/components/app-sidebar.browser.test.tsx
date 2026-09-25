import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import App from "@/App";

// These tests run in WebKit with the application's CSS, because they measure
// the layout and move the focus with the keyboard. The Tauri backend is
// replaced by a fake with no meetings.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (command: string) => {
        if (command === "list_meetings") return [];
        throw `unexpected command ${command}`;
    });
});

function meetingsLink() {
    return within(screen.getByRole("navigation", { name: "Main" })).getByRole(
        "link",
        { name: "Meetings" },
    );
}

async function renderApp() {
    render(<App />);
    await screen.findByText("No meetings yet");
}

describe("AppSidebar", () => {
    it("reaches the Meetings link first with the Tab key", async () => {
        await renderApp();

        await userEvent.tab();

        expect(document.activeElement).toBe(meetingsLink());
    });

    it("shows the icon and not the section name", async () => {
        await renderApp();
        const link = meetingsLink();
        const title = within(link).getByText("Meetings", { selector: "span" });

        expect(title.getBoundingClientRect().width).toBeLessThanOrEqual(1);
        expect(link.scrollWidth).toBe(link.clientWidth);
    });

    it("opens the tooltip to the right of the icon, inside the window", async () => {
        await renderApp();
        const link = meetingsLink();

        await userEvent.hover(link);

        const popup = await screen.findByRole("tooltip");
        // The tooltip slides in from the left, so measure it after it stops.
        await Promise.all(
            popup.getAnimations().map((animation) => animation.finished),
        );
        const tooltip = popup.getBoundingClientRect();
        expect(tooltip.left).toBeGreaterThanOrEqual(
            link.getBoundingClientRect().right,
        );
        expect(tooltip.top).toBeGreaterThanOrEqual(0);
        expect(tooltip.right).toBeLessThanOrEqual(window.innerWidth);
    });

    it("closes the tooltip when the pointer leaves the icon", async () => {
        await renderApp();
        const link = meetingsLink();
        await userEvent.hover(link);
        await screen.findByRole("tooltip");

        await userEvent.unhover(link);

        await expect
            .poll(() => screen.queryByRole("tooltip"))
            .not.toBeInTheDocument();
    });

    it("highlights the current section", async () => {
        await renderApp();
        const navigation = screen.getByRole("navigation", { name: "Main" });

        expect(getComputedStyle(meetingsLink()).backgroundColor).not.toBe(
            getComputedStyle(navigation).backgroundColor,
        );
    });
});
