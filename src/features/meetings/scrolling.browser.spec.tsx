import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import App from "@/App";

// Feature spec for docs/specs/0002-scrollable-editor-with-chrome.md.
// It runs in WebKit with the application's CSS, at the default window size of
// 1200 by 800 pixels. The Tauri backend is replaced by an in-memory fake.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

type Meeting = {
    id: number;
    name: string;
    date: string;
    notes: string;
    createdAt: string;
    updatedAt: string;
};

let meetings: Meeting[];

function seed(name: string, notes = "") {
    const now = new Date().toISOString();
    const meeting: Meeting = {
        id: meetings.length + 1,
        name,
        date: "2026-09-24",
        notes,
        createdAt: now,
        updatedAt: now,
    };
    meetings.push(meeting);
    return meeting;
}

async function handle(command: string, args: Record<string, unknown> = {}) {
    switch (command) {
        case "list_meetings":
            return meetings.map(({ id, name, date, updatedAt }) => ({
                id,
                name,
                date,
                updatedAt,
            }));
        case "get_meeting":
            return meetings.find((m) => m.id === args.id) ?? null;
        case "update_meeting": {
            const meeting = meetings.find((m) => m.id === args.id);
            if (!meeting) throw `meeting ${String(args.id)} not found`;
            Object.assign(meeting, args);
            return meeting;
        }
        default:
            throw `unexpected command ${command}`;
    }
}

beforeEach(() => {
    meetings = [];
    invoke.mockReset();
    invoke.mockImplementation(handle);
});

/** Markdown with `count` paragraphs, "Paragraph 1" to "Paragraph <count>". */
function longNotes(count: number) {
    return Array.from({ length: count }, (_, i) => `Paragraph ${i + 1}`).join(
        "\n\n",
    );
}

/** Opens the meeting named `name` from the Meetings page. */
async function openMeeting(name: string) {
    render(<App />);
    await userEvent.click(
        await screen.findByRole("link", { name: new RegExp(`^${name}`) }),
    );
    const notes = await screen.findByRole("textbox", { name: "Notes" });
    expect(screen.getByRole("textbox", { name: "Meeting name" })).toHaveValue(
        name,
    );
    return notes;
}

function editorChrome() {
    return [
        screen.getByRole("navigation", { name: "breadcrumb" }),
        screen.getByRole("textbox", { name: "Meeting name" }),
        screen.getByLabelText("Meeting date"),
        screen.getByRole("toolbar", { name: "Formatting" }),
    ];
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

function expectFullyVisible(elements: Element[]) {
    for (const element of elements) {
        expect(isFullyVisible(element), element.outerHTML.slice(0, 80)).toBe(
            true,
        );
    }
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

describe("Editor page with long notes", () => {
    it("scrolls the notes while the header, name, date, and toolbar stay in place", async () => {
        seed("Weekly sync", longNotes(150));
        const notes = await openMeeting("Weekly sync");
        const chrome = editorChrome();
        const before = positions(chrome);

        await scrollUntilVisible(
            within(notes).getByText("Paragraph 1"),
            within(notes).getByText("Paragraph 150"),
        );

        expect(positions(chrome)).toEqual(before);
        expectFullyVisible(chrome);
        expectWindowNotScrolled();
    });

    it("applies formatting from the toolbar to text at the end of the notes", async () => {
        seed("Weekly sync", longNotes(150));
        const notes = await openMeeting("Weekly sync");
        const last = within(notes).getByText("Paragraph 150");
        await scrollUntilVisible(within(notes).getByText("Paragraph 1"), last);

        await userEvent.tripleClick(last);
        const bold = screen.getByRole("button", { name: "Bold" });
        // The user can reach the button without scrolling back to the top.
        expectFullyVisible([bold, last]);
        await userEvent.click(bold);

        expect(
            within(notes).getByText("Paragraph 150").closest("strong"),
        ).not.toBeNull();
    });

    it("keeps the text cursor visible while the user types at the end of the notes", async () => {
        seed("Weekly sync", longNotes(150));
        const notes = await openMeeting("Weekly sync");
        const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
        const toolbarBefore = positions([toolbar]);
        const last = within(notes).getByText("Paragraph 150");
        await scrollUntilVisible(within(notes).getByText("Paragraph 1"), last);

        await userEvent.tripleClick(last);
        await userEvent.keyboard(`${"{Enter}".repeat(40)}Newest line`);

        const newest = await within(notes).findByText("Newest line");
        const { top, bottom } = newest.getBoundingClientRect();
        expect(top).toBeGreaterThanOrEqual(
            toolbar.getBoundingClientRect().bottom,
        );
        expect(bottom).toBeLessThanOrEqual(window.innerHeight);
        expect(positions([toolbar])).toEqual(toolbarBefore);
    });
});

describe("Editor page with short notes", () => {
    it("fills the space below the toolbar, so a click near the bottom of the window puts the cursor in the notes", async () => {
        seed("Weekly sync", "Just one line");
        const notes = await openMeeting("Weekly sync");
        const area = notes.getBoundingClientRect();
        const x = area.left + 20;
        const y = window.innerHeight - 24;

        const target = document.elementFromPoint(x, y);
        expect(target && notes.contains(target)).toBe(true);
        await userEvent.click(notes, {
            position: { x: 20, y: y - area.top },
        });

        expect(document.activeElement).toBe(notes);
        expectWindowNotScrolled();
    });
});

describe("Meetings page with a long list", () => {
    it("scrolls the list while the header, title, and New note button stay in place", async () => {
        for (let i = 1; i <= 60; i++) seed(`Weekly ${i}`);
        render(<App />);
        const first = await screen.findByRole("link", { name: /Weekly 1\b/ });
        const chrome = [
            screen.getByRole("navigation", { name: "breadcrumb" }),
            screen.getByRole("heading", { name: "Meetings" }),
            screen.getByRole("button", { name: "New note" }),
        ];
        const before = positions(chrome);

        await scrollUntilVisible(
            first,
            screen.getByRole("link", { name: /Weekly 60\b/ }),
        );

        expect(positions(chrome)).toEqual(before);
        expectFullyVisible(chrome);
        expectWindowNotScrolled();
    });
});
