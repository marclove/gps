import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

// Layout cases for the Meetings page that the feature specs do not cover. The Tauri
// backend is replaced by a fake that returns a fixed list of meetings.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (command: string) => {
        if (command !== "list_meetings") throw `unexpected command ${command}`;
        return Array.from({ length: 3 }, (_, i) => ({
            id: i + 1,
            name: `Weekly ${i + 1}`,
            date: "2026-09-24",
            updatedAt: new Date().toISOString(),
        }));
    });
});

describe("MeetingsPage layout", () => {
    it("leaves room above the first meeting for its focus ring", async () => {
        render(<App />);
        const first = await screen.findByRole("link", { name: /^Weekly 1/ });
        // The list scrolls in its own area, which cuts off anything drawn outside
        // it, such as the 3 pixel focus ring that WebKit draws around a link.
        const area = first.closest("ul")!.parentElement!;

        expect(
            first.getBoundingClientRect().top -
                area.getBoundingClientRect().top,
        ).toBeGreaterThanOrEqual(3);
    });
});
