import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import App from "@/App";

// Feature spec for docs/specs/0004-archive-meeting-notes.md, for the visibility of
// the archive button, which depends on the application's CSS. It runs in WebKit at
// the default window size of 1200 by 800 pixels. The Tauri backend is replaced by a
// fake with two meetings.

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
