import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import App from "@/App";

// Layout cases that the feature spec for docs/specs/0002-scrollable-editor-with-chrome.md
// does not cover. The Tauri backend is replaced by an in-memory fake.

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

function seed(name: string, notes: string) {
    const now = new Date().toISOString();
    meetings.push({
        id: meetings.length + 1,
        name,
        date: "2026-09-24",
        notes,
        createdAt: now,
        updatedAt: now,
    });
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

afterEach(async () => {
    // Some tests make the window smaller. Other tests expect the default window
    // size of the application.
    await page.viewport(1200, 800);
});

/** Markdown with `count` paragraphs, "Paragraph 1" to "Paragraph <count>". */
function longNotes(count: number) {
    return Array.from({ length: count }, (_, i) => `Paragraph ${i + 1}`).join(
        "\n\n",
    );
}

/** Opens the meeting whose name starts with `name` from the Meetings page. */
async function openMeeting(name: string) {
    await userEvent.click(
        await screen.findByRole("link", { name: new RegExp(`^${name}`) }),
    );
    return screen.findByRole("textbox", { name: "Notes" });
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
        const { top, bottom, left } = element.getBoundingClientRect();
        return { top, bottom, left };
    });
}

function isFullyVisible(element: Element) {
    const { top, bottom } = element.getBoundingClientRect();
    return top >= 0 && bottom <= window.innerHeight;
}

/** Scrolls with the mouse wheel over `element` until `target` is fully visible. */
async function scrollUntilVisible(element: Element, target: Element) {
    await userEvent.wheel(element, { delta: { y: 100000 } });
    await expect.poll(() => isFullyVisible(target)).toBe(true);
}

/** The vertical space between two elements, or 0 if they overlap vertically. */
function distance(a: Element, b: Element) {
    const first = a.getBoundingClientRect();
    const second = b.getBoundingClientRect();
    return Math.max(0, first.top - second.bottom, second.top - first.bottom);
}

async function expectChromeStaysWhileNotesScroll(notes: HTMLElement) {
    const chrome = editorChrome();
    const before = positions(chrome);

    await scrollUntilVisible(
        within(notes).getByText("Paragraph 1"),
        within(notes).getByText("Paragraph 150"),
    );

    expect(positions(chrome)).toEqual(before);
    for (const element of chrome) expect(isFullyVisible(element)).toBe(true);
    expect(window.scrollY).toBe(0);
}

describe("MeetingEditor layout", () => {
    it("keeps the chrome in place at the minimum window size", async () => {
        await page.viewport(900, 600);
        seed("Weekly sync", longNotes(150));
        render(<App />);

        await expectChromeStaysWhileNotesScroll(
            await openMeeting("Weekly sync"),
        );
    });

    it("keeps the chrome in place when the sidebar is hidden", async () => {
        seed("Weekly sync", longNotes(150));
        render(<App />);
        const notes = await openMeeting("Weekly sync");

        const main = document.querySelector('[data-slot="sidebar-inset"]')!;
        const rightBefore = main.getBoundingClientRect().right;

        await userEvent.click(
            screen.getByRole("button", { name: "Toggle Sidebar" }),
        );
        // Wait for the sidebar to finish sliding away: it is collapsed, the main area
        // has grown to the right, and no transition is still running.
        await expect
            .poll(() =>
                document
                    .querySelector('[data-slot="sidebar"]')
                    ?.getAttribute("data-state"),
            )
            .toBe("collapsed");
        await expect
            .poll(
                () =>
                    main.getBoundingClientRect().right > rightBefore &&
                    document.getAnimations().length === 0,
            )
            .toBe(true);

        await expectChromeStaysWhileNotesScroll(notes);
    });

    it("shows the start of the notes when the user opens another meeting after scrolling", async () => {
        seed("Weekly sync", longNotes(150));
        seed("Planning", longNotes(150));
        render(<App />);
        let notes = await openMeeting("Weekly sync");
        await scrollUntilVisible(
            within(notes).getByText("Paragraph 1"),
            within(notes).getByText("Paragraph 150"),
        );

        await userEvent.click(
            within(
                screen.getByRole("navigation", { name: "breadcrumb" }),
            ).getByRole("link", { name: "Meetings" }),
        );
        notes = await openMeeting("Planning");

        const first = within(notes).getByText("Paragraph 1");
        expect(isFullyVisible(first)).toBe(true);
        expect(first.getBoundingClientRect().top).toBeGreaterThanOrEqual(
            screen
                .getByRole("toolbar", { name: "Formatting" })
                .getBoundingClientRect().bottom,
        );
    });

    it("wraps a long unbroken word instead of scrolling sideways", async () => {
        const word = "x".repeat(400);
        seed("Weekly sync", word);
        render(<App />);
        const notes = await openMeeting("Weekly sync");

        // Measure the text itself, not the paragraph that contains it, because
        // text that does not wrap spills out of its paragraph.
        const text = document.createRange();
        text.selectNodeContents(within(notes).getByText(word));
        expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(
            notes.getBoundingClientRect().right,
        );
        // No element around the notes, such as the scrolling notes area, can
        // scroll sideways.
        for (
            let element: Element | null = notes;
            element;
            element = element.parentElement
        ) {
            expect(
                element.scrollWidth,
                element.outerHTML.slice(0, 80),
            ).toBeLessThanOrEqual(element.clientWidth);
        }
    });

    it("keeps the link popover next to the text while the notes scroll", async () => {
        seed("Weekly sync", longNotes(150));
        render(<App />);
        const notes = await openMeeting("Weekly sync");
        const last = within(notes).getByText("Paragraph 150");
        await scrollUntilVisible(within(notes).getByText("Paragraph 1"), last);
        await userEvent.tripleClick(last);
        await userEvent.click(screen.getByRole("button", { name: "Link" }));
        const popover = await screen.findByRole("dialog");
        const textTop = last.getBoundingClientRect().top;

        await userEvent.wheel(within(notes).getByText("Paragraph 140"), {
            delta: { y: -200 },
        });

        await expect
            .poll(() => last.getBoundingClientRect().top)
            .toBeGreaterThan(textTop + 100);
        await expect.poll(() => distance(popover, last)).toBeLessThan(16);
    });

    it("hides the link popover while its text is scrolled out of view", async () => {
        seed("Weekly sync", longNotes(150));
        render(<App />);
        const notes = await openMeeting("Weekly sync");
        const last = within(notes).getByText("Paragraph 150");
        await scrollUntilVisible(within(notes).getByText("Paragraph 1"), last);
        await userEvent.tripleClick(last);
        await userEvent.click(screen.getByRole("button", { name: "Link" }));
        const popover = await screen.findByRole("dialog");
        const visible = () =>
            popover.checkVisibility({ visibilityProperty: true });
        expect(visible()).toBe(true);

        await userEvent.wheel(within(notes).getByText("Paragraph 140"), {
            delta: { y: -2000 },
        });
        await expect.poll(visible).toBe(false);

        await scrollUntilVisible(
            within(notes).getByText("Paragraph 100"),
            last,
        );
        await expect.poll(visible).toBe(true);
    });
});
