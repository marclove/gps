import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

// Feature spec for docs/specs/0001-take-meeting-notes.md.
// The Tauri backend is replaced by an in-memory fake of the meeting commands.

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

type UpdateArgs = Pick<Meeting, "id" | "name" | "date" | "notes">;

class FakeBackend {
    meetings: Meeting[] = [];
    failNextList = false;
    failUpdates = false;
    private nextId = 1;

    seed(fields: Partial<Meeting> & Pick<Meeting, "name" | "date">): Meeting {
        const now = new Date().toISOString();
        const meeting: Meeting = {
            id: this.nextId++,
            notes: "",
            createdAt: now,
            updatedAt: now,
            ...fields,
        };
        this.meetings.push(meeting);
        return meeting;
    }

    updates(): UpdateArgs[] {
        return invoke.mock.calls
            .filter(([command]) => command === "update_meeting")
            .map(([, args]) => args as UpdateArgs);
    }

    lastUpdate(): UpdateArgs | undefined {
        const updates = this.updates();
        return updates[updates.length - 1];
    }

    handle = async (
        command: string,
        args: Record<string, unknown> = {},
    ): Promise<unknown> => {
        switch (command) {
            case "list_meetings": {
                if (this.failNextList) {
                    this.failNextList = false;
                    throw "database is locked";
                }
                return [...this.meetings]
                    .sort(
                        (a, b) =>
                            b.date.localeCompare(a.date) ||
                            b.createdAt.localeCompare(a.createdAt),
                    )
                    .map(({ id, name, date, updatedAt }) => ({
                        id,
                        name,
                        date,
                        updatedAt,
                    }));
            }
            case "create_meeting":
                return this.seed({
                    name: "Untitled meeting",
                    date: args.date as string,
                });
            case "get_meeting": {
                const meeting = this.meetings.find((m) => m.id === args.id);
                if (!meeting) throw `meeting ${String(args.id)} not found`;
                return meeting;
            }
            case "update_meeting": {
                if (this.failUpdates) throw "disk I/O error";
                const meeting = this.meetings.find((m) => m.id === args.id);
                if (!meeting) throw `meeting ${String(args.id)} not found`;
                Object.assign(meeting, {
                    name: args.name,
                    date: args.date,
                    notes: args.notes,
                    updatedAt: new Date().toISOString(),
                });
                return meeting;
            }
            default:
                throw `unexpected command ${command}`;
        }
    };
}

const SAVE_TIMEOUT = { timeout: 2000 };

let backend: FakeBackend;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 24, 10, 0));
    invoke.mockReset();
    backend = new FakeBackend();
    invoke.mockImplementation(backend.handle);
});

afterEach(() => {
    vi.useRealTimers();
});

function renderApp() {
    const user = userEvent.setup();
    render(<App />);
    return user;
}

function formatDate(year: number, month: number, day: number): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(year, month - 1, day),
    );
}

function sidebarNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

function breadcrumb() {
    return screen.getByRole("navigation", { name: "breadcrumb" });
}

async function createNote(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "New note" }));
    return screen.findByRole("textbox", { name: "Notes" });
}

describe("Take meeting notes", () => {
    it("shows an empty Meetings page with a New note button", async () => {
        renderApp();

        expect(await screen.findByText("No meetings yet")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "New note" }),
        ).toBeInTheDocument();
        expect(
            within(sidebarNavigation()).getByRole("link", { name: "Meetings" }),
        ).toBeInTheDocument();
        expect(breadcrumb()).toHaveTextContent("Meetings");
    });

    it("lists meetings with their name and date in the order the backend returns", async () => {
        backend.seed({ name: "Kickoff", date: "2026-09-18" });
        backend.seed({ name: "Weekly sync", date: "2026-09-24" });
        backend.seed({ name: "1:1 with Sam", date: "2026-09-22" });
        renderApp();

        await screen.findByRole("link", { name: /Weekly sync/ });
        const meetingLinks = screen
            .getAllByRole("link")
            .filter((link) =>
                /Kickoff|Weekly sync|1:1 with Sam/.test(link.textContent ?? ""),
            );

        expect(meetingLinks.map((link) => link.textContent)).toEqual([
            expect.stringContaining("Weekly sync"),
            expect.stringContaining("1:1 with Sam"),
            expect.stringContaining("Kickoff"),
        ]);
        expect(meetingLinks[0]).toHaveTextContent(formatDate(2026, 9, 24));
        expect(meetingLinks[2]).toHaveTextContent(formatDate(2026, 9, 18));
    });

    it("shows an error with a Retry button when the list cannot be loaded", async () => {
        backend.seed({ name: "Weekly sync", date: "2026-09-24" });
        backend.failNextList = true;
        const user = renderApp();

        expect(
            await screen.findByText("Couldn't load meetings"),
        ).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Retry" }));

        expect(
            await screen.findByRole("link", { name: /Weekly sync/ }),
        ).toBeInTheDocument();
    });

    it("creates an untitled meeting dated today and opens it for editing", async () => {
        const user = renderApp();

        await createNote(user);

        expect(invoke).toHaveBeenCalledWith("create_meeting", {
            date: "2026-09-24",
        });
        const name = screen.getByRole<HTMLInputElement>("textbox", {
            name: "Meeting name",
        });
        expect(name).toHaveValue("Untitled meeting");
        expect(name).toHaveFocus();
        expect(name.selectionStart).toBe(0);
        expect(name.selectionEnd).toBe("Untitled meeting".length);
        expect(screen.getByLabelText("Meeting date")).toHaveValue("2026-09-24");
        expect(breadcrumb()).toHaveTextContent("Untitled meeting");
    });

    it("autosaves notes as Markdown after the user pauses", async () => {
        const user = renderApp();
        const notes = await createNote(user);

        await user.click(notes);
        await user.click(screen.getByRole("button", { name: "Task list" }));
        await user.type(notes, "Send notes to team");

        await waitFor(
            () =>
                expect(backend.lastUpdate()?.notes.trim()).toBe(
                    "- [ ] Send notes to team",
                ),
            SAVE_TIMEOUT,
        );
        expect(backend.lastUpdate()).toMatchObject({
            name: "Untitled meeting",
            date: "2026-09-24",
        });
        expect(await screen.findByText("Saved")).toBeInTheDocument();
    });

    it("autosaves the meeting name and date and shows the new name", async () => {
        const user = renderApp();
        await createNote(user);

        const name = screen.getByRole("textbox", { name: "Meeting name" });
        await user.clear(name);
        await user.type(name, "Weekly sync");
        fireEvent.change(screen.getByLabelText("Meeting date"), {
            target: { value: "2026-09-25" },
        });

        await waitFor(
            () =>
                expect(backend.lastUpdate()).toMatchObject({
                    name: "Weekly sync",
                    date: "2026-09-25",
                }),
            SAVE_TIMEOUT,
        );
        expect(breadcrumb()).toHaveTextContent("Weekly sync");

        await user.click(
            within(sidebarNavigation()).getByRole("link", { name: "Meetings" }),
        );
        const link = await screen.findByRole("link", { name: /Weekly sync/ });
        expect(link).toHaveTextContent(formatDate(2026, 9, 25));
    });

    it("saves a pending change immediately when the user leaves the editor", async () => {
        const user = renderApp();
        const notes = await createNote(user);

        await user.type(notes, "Quick thought");
        await user.click(
            within(sidebarNavigation()).getByRole("link", { name: "Meetings" }),
        );

        await waitFor(
            () =>
                expect(backend.lastUpdate()?.notes.trim()).toBe(
                    "Quick thought",
                ),
            { timeout: 300 },
        );
    });

    it("shows stored Markdown as formatted notes when opening a meeting", async () => {
        backend.seed({
            name: "Planning",
            date: "2026-09-20",
            notes: "## Agenda\n\n- [x] Review roadmap\n",
        });
        const user = renderApp();

        await user.click(await screen.findByRole("link", { name: /Planning/ }));
        const notes = await screen.findByRole("textbox", { name: "Notes" });

        expect(
            await within(notes).findByRole("heading", {
                level: 2,
                name: "Agenda",
            }),
        ).toBeInTheDocument();
        expect(within(notes).getByRole("checkbox")).toBeChecked();
        expect(notes).toHaveTextContent("Review roadmap");
        expect(notes).not.toHaveTextContent("##");
        expect(
            screen.getByRole("textbox", { name: "Meeting name" }),
        ).toHaveValue("Planning");
    });

    it("keeps the text and reports the problem when a save fails", async () => {
        const user = renderApp();
        const notes = await createNote(user);
        backend.failUpdates = true;

        await user.type(notes, "Discussed roadmap");

        expect(
            await screen.findByText("Couldn't save", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Retry" }),
        ).toBeInTheDocument();
        expect(notes).toHaveTextContent("Discussed roadmap");
    });

    it("returns to the Meetings page from the sidebar", async () => {
        const user = renderApp();
        await createNote(user);

        await user.click(
            within(sidebarNavigation()).getByRole("link", { name: "Meetings" }),
        );

        expect(
            await screen.findByRole("link", { name: /Untitled meeting/ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("textbox", { name: "Notes" }),
        ).not.toBeInTheDocument();
    });
});
