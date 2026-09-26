import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import App from "@/App";

// Feature spec for docs/specs/0004-archive-meeting-notes.md, for the visibility of
// the archive button and the position of the archive toast, which depend on the
// application's CSS. It runs in WebKit at the default window size of 1200 by 800
// pixels. The Tauri backend is replaced by a fake with two meetings.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(async () => {
    await page.viewport(1200, 800);
    invoke.mockReset();
    invoke.mockImplementation(async (command: string) => {
        if (command === "list_meetings") {
            return [
                {
                    id: 2,
                    name: "Weekly sync",
                    date: "2026-09-24",
                    updatedAt: "2026-09-24T10:00:00.000Z",
                },
                {
                    id: 1,
                    name: "Kickoff",
                    date: "2026-09-18",
                    updatedAt: "2026-09-18T10:00:00.000Z",
                },
            ];
        }
        if (command === "archive_meeting") return null;
        throw `unexpected command ${command}`;
    });
});

function opacity(element: Element): number {
    return Number(getComputedStyle(element).opacity);
}

async function renderApp() {
    render(<App />);
    return screen.findByRole("button", { name: 'Archive "Weekly sync"' });
}

describe("Archive button visibility", () => {
    it("is hidden until the pointer is over the meeting's row", async () => {
        const archive = await renderApp();
        const other = screen.getByRole("button", { name: 'Archive "Kickoff"' });

        expect(opacity(archive)).toBe(0);

        await userEvent.hover(
            screen.getByRole("link", { name: /Weekly sync/ }),
        );

        await expect.poll(() => opacity(archive)).toBe(1);
        expect(opacity(other)).toBe(0);
    });

    it("is visible when it has keyboard focus", async () => {
        const archive = await renderApp();
        const other = screen.getByRole("button", { name: 'Archive "Kickoff"' });
        // Move the pointer off the row first. Otherwise a leftover hover from an
        // earlier test could keep the row's hover style active and make this test
        // pass even if focus-visible:opacity-100 were broken.
        await userEvent.unhover(
            screen.getByRole("link", { name: /Weekly sync/ }),
        );

        screen.getByRole("link", { name: /Weekly sync/ }).focus();
        await userEvent.tab();

        expect(archive).toHaveFocus();
        await expect.poll(() => opacity(archive)).toBe(1);
        expect(opacity(other)).toBe(0);
    });
});

/** The largest distance, in pixels, from the toast to the window edges. */
const TOAST_EDGE_DISTANCE = 32;

describe("Archive toast position", () => {
    it("is at the bottom right of the window", async () => {
        const archive = await renderApp();

        await userEvent.click(archive);
        const text = await screen.findByText('Archived "Weekly sync".');
        const toast = text.closest("[data-slot='toast']") ?? text;

        // Polls until the toast is fully settled at the bottom right, rather than
        // checking its position once, because it slides in from below the window.
        await expect
            .poll(() => {
                const box = toast.getBoundingClientRect();
                return (
                    box.bottom >= 800 - TOAST_EDGE_DISTANCE &&
                    box.bottom <= 800 &&
                    box.right >= 1200 - TOAST_EDGE_DISTANCE &&
                    box.right <= 1200 &&
                    box.left > 600
                );
            })
            .toBe(true);
    });

    it("has the text at the left and Undo and Close at the right", async () => {
        const archive = await renderApp();

        await userEvent.click(archive);
        const text = await screen.findByText('Archived "Weekly sync".');
        const toast = text.closest("[data-slot='toast']");
        if (!toast) throw new Error("The text is not in a toast");
        const undo = within(toast as HTMLElement).getByRole("button", {
            name: "Undo",
        });
        const close = within(toast as HTMLElement).getByRole("button", {
            name: "Close",
        });

        // Poll until the toast has finished sliding in, then compare the positions of
        // its parts with the edges of the toast.
        await expect
            .poll(() => {
                const box = toast.getBoundingClientRect();
                const closeBox = close.getBoundingClientRect();
                const undoBox = undo.getBoundingClientRect();
                return (
                    box.right - closeBox.right <= TOAST_EDGE_DISTANCE &&
                    undoBox.right <= closeBox.left &&
                    text.getBoundingClientRect().right <= undoBox.left
                );
            })
            .toBe(true);
    });
});
