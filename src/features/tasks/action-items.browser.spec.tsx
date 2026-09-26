import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import App from "@/App";

// Feature spec for docs/specs/0005-meeting-action-items.md.
// It runs in WebKit with the application's CSS, at the default window size of
// 1200 by 800 pixels. The Tauri backend is replaced by an in-memory fake.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

type Task = {
    id: number;
    meetingId: number;
    description: string;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
};

const MEETING = {
    id: 1,
    name: "Weekly sync",
    date: "2026-09-24",
    notes: "Discussed the roadmap",
    createdAt: "2026-09-24T10:00:00.000Z",
    updatedAt: "2026-09-24T10:00:00.000Z",
};

let tasks: Task[];

function seedTask(description: string, completed = false) {
    const time = new Date(
        Date.UTC(2026, 8, 24, 10, 0, tasks.length + 1),
    ).toISOString();
    tasks.push({
        id: tasks.length + 1,
        meetingId: MEETING.id,
        description,
        createdAt: time,
        updatedAt: time,
        completedAt: completed ? time : null,
    });
}

async function handle(command: string, args: Record<string, unknown> = {}) {
    switch (command) {
        case "list_meetings":
            return [MEETING];
        case "get_meeting":
            return args.id === MEETING.id ? MEETING : null;
        case "update_meeting":
            return MEETING;
        case "list_meeting_tasks":
            return tasks.map((t) => ({ ...t }));
        case "create_task": {
            seedTask(args.description as string);
            return { ...tasks[tasks.length - 1] };
        }
        case "set_task_completed": {
            const task = tasks.find((t) => t.id === args.id);
            if (!task) throw `task ${String(args.id)} not found`;
            task.completedAt = args.completed ? task.updatedAt : null;
            return { ...task };
        }
        default:
            throw `unexpected command ${command}`;
    }
}

beforeEach(() => {
    tasks = [];
    invoke.mockReset();
    invoke.mockImplementation(handle);
});

async function openMeeting() {
    render(<App />);
    await userEvent.click(
        await screen.findByRole("link", { name: /^Weekly sync/ }),
    );
    await screen.findByRole("textbox", { name: "Notes" });
    return screen.getByRole("region", { name: "Action items" });
}

async function findItemField(panel: HTMLElement, text: string) {
    await expect
        .poll(() =>
            within(panel)
                .queryAllByRole("textbox", { name: "Action item" })
                .some((f) => (f as HTMLInputElement).value === text),
        )
        .toBe(true);
    return within(panel)
        .getAllByRole("textbox", { name: "Action item" })
        .find((f) => (f as HTMLInputElement).value === text) as HTMLElement;
}

/** The computed text color of an element whose CSS color is the theme variable `name`. */
function themeColor(name: string) {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
}

function positions(elements: Element[]) {
    return elements.map((element) => {
        const { top, bottom, left, right } = element.getBoundingClientRect();
        return { top, bottom, left, right };
    });
}

function isFullyVisible(element: Element) {
    const { top, bottom } = element.getBoundingClientRect();
    return top >= 0 && bottom <= window.innerHeight;
}

describe("Action items panel", () => {
    it("grows the Add action item field for a long text, and shrinks it after the item is added", async () => {
        const panel = await openMeeting();
        const add = within(panel).getByRole("textbox", {
            name: "Add action item",
        });
        await expect
            .poll(() => (add as HTMLTextAreaElement).disabled)
            .toBe(false);
        const oneLine = add.getBoundingClientRect().height;

        await userEvent.click(add);
        await userEvent.keyboard(
            "Here is my really long task that needs several lines to be read in full",
        );

        await expect
            .poll(() => add.getBoundingClientRect().height)
            .toBeGreaterThan(oneLine * 1.5);
        expect(add.scrollWidth).toBeLessThanOrEqual(add.clientWidth);
        expect(add.scrollHeight).toBeLessThanOrEqual(add.clientHeight + 1);

        await userEvent.keyboard("{Enter}");

        await findItemField(
            panel,
            "Here is my really long task that needs several lines to be read in full",
        );
        await expect
            .poll(() => add.getBoundingClientRect().height)
            .toBe(oneLine);
    });

    it("wraps a long item text so that the whole text is visible", async () => {
        seedTask("Short");
        seedTask(
            "Here is my really long task that needs several lines to be read in full, because it describes a lot of work",
        );
        const panel = await openMeeting();
        const short = await findItemField(panel, "Short");
        const long = await findItemField(
            panel,
            "Here is my really long task that needs several lines to be read in full, because it describes a lot of work",
        );
        const aside = screen.getByRole("complementary", {
            name: "Meeting details",
        });

        // The whole text is visible: nothing is hidden sideways or below the field.
        expect(long.scrollWidth).toBeLessThanOrEqual(long.clientWidth);
        expect(long.scrollHeight).toBeLessThanOrEqual(long.clientHeight + 1);
        // The text wraps onto more lines, so the field is taller than a one-line item.
        expect(long.getBoundingClientRect().height).toBeGreaterThan(
            short.getBoundingClientRect().height * 1.5,
        );
        expect(long.getBoundingClientRect().right).toBeLessThanOrEqual(
            aside.getBoundingClientRect().right,
        );
        // The checkbox lines up with the first line of the text.
        const checkbox = within(panel).getByRole("checkbox", {
            name: /^Complete "Here is my really long task/,
        });
        expect(checkbox.getBoundingClientRect().top).toBeLessThan(
            long.getBoundingClientRect().top +
                short.getBoundingClientRect().height,
        );
    });

    it("is a sidebar as tall as the main area, at the right of the header, name, and notes", async () => {
        seedTask("Send the deck");
        const panel = await openMeeting();
        await findItemField(panel, "Send the deck");

        const aside = screen.getByRole("complementary", {
            name: "Meeting details",
        });
        const area = aside.getBoundingClientRect();
        const main = screen.getByRole("main").getBoundingClientRect();
        expect(Math.round(area.top)).toBe(Math.round(main.top));
        expect(Math.round(area.bottom)).toBe(Math.round(main.bottom));
        expect(Math.round(area.right)).toBe(window.innerWidth);
        expect(area.width).toBeGreaterThan(0);
        expect(aside.contains(panel)).toBe(true);
        for (const element of [
            screen.getByRole("navigation", { name: "breadcrumb" }),
            screen.getByRole("textbox", { name: "Meeting name" }),
            screen.getByRole("toolbar", { name: "Formatting" }),
            screen.getByRole("textbox", { name: "Notes" }),
        ]) {
            expect(
                element.getBoundingClientRect().right,
                element.outerHTML.slice(0, 80),
            ).toBeLessThanOrEqual(area.left);
        }
    });

    it("shows the date, then the Archive button, then the action items, from top to bottom", async () => {
        const panel = await openMeeting();
        const aside = screen.getByRole("complementary", {
            name: "Meeting details",
        });
        const date = within(aside).getByLabelText("Meeting date");
        const archive = within(aside).getByRole("button", { name: "Archive" });
        const heading = within(panel).getByRole("heading", {
            name: "Action items",
        });

        expect(date.getBoundingClientRect().bottom).toBeLessThanOrEqual(
            archive.getBoundingClientRect().top,
        );
        expect(archive.getBoundingClientRect().bottom).toBeLessThanOrEqual(
            heading.getBoundingClientRect().top,
        );
    });

    it("grays out the text of a checked item and restores it when unchecked", async () => {
        seedTask("Send the deck");
        seedTask("Book a room", true);
        const panel = await openMeeting();
        const deck = await findItemField(panel, "Send the deck");
        const room = await findItemField(panel, "Book a room");
        const normal = themeColor("--foreground");
        const muted = themeColor("--muted-foreground");
        expect(muted).not.toBe(normal);

        expect(getComputedStyle(deck).color).toBe(normal);
        expect(getComputedStyle(room).color).toBe(muted);

        await userEvent.click(
            within(panel).getByRole("checkbox", {
                name: 'Complete "Send the deck"',
            }),
        );
        await expect.poll(() => getComputedStyle(deck).color).toBe(muted);

        await userEvent.click(
            within(panel).getByRole("checkbox", {
                name: 'Complete "Send the deck"',
            }),
        );
        await expect.poll(() => getComputedStyle(deck).color).toBe(normal);
    });

    it("scrolls a long list while the date, Archive, the heading, the Add action item field, and the notes stay in place", async () => {
        for (let i = 1; i <= 60; i++) seedTask(`Item ${i}`);
        const panel = await openMeeting();
        const first = await findItemField(panel, "Item 1");
        const last = await findItemField(panel, "Item 60");
        const fixed = [
            screen.getByLabelText("Meeting date"),
            screen.getByRole("button", { name: "Archive" }),
            within(panel).getByRole("heading", { name: "Action items" }),
            within(panel).getByRole("textbox", { name: "Add action item" }),
            screen.getByRole("toolbar", { name: "Formatting" }),
            screen.getByRole("textbox", { name: "Notes" }),
        ];
        const before = positions(fixed);
        expect(isFullyVisible(last)).toBe(false);

        await userEvent.wheel(first, { delta: { y: 100000 } });
        await expect.poll(() => isFullyVisible(last)).toBe(true);

        expect(positions(fixed)).toEqual(before);
        for (const element of fixed.slice(0, 4)) {
            expect(isFullyVisible(element)).toBe(true);
        }
        expect(window.scrollY).toBe(0);
        expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
            window.innerHeight,
        );
    });
});
