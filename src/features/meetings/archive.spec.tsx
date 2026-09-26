import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

// Feature spec for docs/specs/0004-archive-meeting-notes.md.
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

type StoredMeeting = Meeting & { archivedAt: string | null };

/** Returns the meeting as the commands return it, without the time it was archived. */
function withoutArchiveTime(stored: StoredMeeting): Meeting {
    const { id, name, date, notes, createdAt, updatedAt } = stored;
    return { id, name, date, notes, createdAt, updatedAt };
}

type UpdateArgs = Pick<Meeting, "id" | "name" | "date" | "notes">;

class FakeBackend {
    meetings: StoredMeeting[] = [];
    failArchive = false;
    failUnarchive = false;
    private nextId = 1;

    seed(fields: Partial<Meeting> & Pick<Meeting, "name" | "date">): Meeting {
        const now = new Date().toISOString();
        const meeting: StoredMeeting = {
            id: this.nextId++,
            notes: "",
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            ...fields,
        };
        this.meetings.push(meeting);
        return meeting;
    }

    find(id: number): StoredMeeting | undefined {
        return this.meetings.find((m) => m.id === id);
    }

    lastUpdate(): UpdateArgs | undefined {
        const updates = invoke.mock.calls
            .filter(([command]) => command === "update_meeting")
            .map(([, args]) => args as UpdateArgs);
        return updates[updates.length - 1];
    }

    private stored(id: unknown): StoredMeeting {
        const meeting = this.find(id as number);
        if (!meeting) throw `meeting ${String(id)} not found`;
        return meeting;
    }

    handle = async (
        command: string,
        args: Record<string, unknown> = {},
    ): Promise<unknown> => {
        switch (command) {
            case "list_meetings":
                return this.meetings
                    .filter((m) => m.archivedAt === null)
                    .sort(
                        (a, b) =>
                            b.date.localeCompare(a.date) ||
                            b.createdAt.localeCompare(a.createdAt) ||
                            b.id - a.id,
                    )
                    .map(({ id, name, date, updatedAt }) => ({
                        id,
                        name,
                        date,
                        updatedAt,
                    }));
            case "create_meeting":
                return this.seed({
                    name: "Untitled meeting",
                    date: args.date as string,
                });
            case "get_meeting": {
                const meeting = this.find(args.id as number);
                return meeting ? withoutArchiveTime(meeting) : null;
            }
            case "update_meeting": {
                const meeting = this.stored(args.id);
                Object.assign(meeting, {
                    name: args.name,
                    date: args.date,
                    notes: args.notes,
                    updatedAt: new Date().toISOString(),
                });
                return withoutArchiveTime(meeting);
            }
            case "archive_meeting": {
                if (this.failArchive) throw "database is locked";
                const meeting = this.stored(args.id);
                meeting.archivedAt ??= new Date().toISOString();
                return null;
            }
            case "unarchive_meeting": {
                if (this.failUnarchive) throw "database is locked";
                this.stored(args.id).archivedAt = null;
                return null;
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

function sidebarNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

/** The names of the meetings in the list, in the order shown, read from their archive buttons. */
function listedMeetingNames(): string[] {
    const names: string[] = [];
    screen.queryAllByRole("button", {
        name: (name) => {
            const match = /^Archive "(.*)"$/.exec(name);
            if (match) names.push(match[1]);
            return match !== null;
        },
    });
    return names;
}

function seedThreeMeetings() {
    backend.seed({ name: "Kickoff", date: "2026-09-18" });
    const standup = backend.seed({ name: "Standup", date: "2026-09-22" });
    backend.seed({ name: "Weekly sync", date: "2026-09-24" });
    return { standup };
}

async function openMeetingsPage(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
        within(sidebarNavigation()).getByRole("link", { name: "Meetings" }),
    );
}

describe("Archive meetings", () => {
    describe("from the Meetings page", () => {
        it("removes the meeting from the list and offers Undo", async () => {
            const { standup } = seedThreeMeetings();
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Standup"',
                }),
            );

            expect(invoke).toHaveBeenCalledWith("archive_meeting", {
                id: standup.id,
            });
            await waitFor(() =>
                expect(
                    screen.queryByRole("link", { name: /Standup/ }),
                ).not.toBeInTheDocument(),
            );
            expect(
                screen.getByRole("link", { name: /Weekly sync/ }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole("link", { name: /Kickoff/ }),
            ).toBeInTheDocument();
            expect(screen.getByText('Archived "Standup".')).toBeInTheDocument();
            expect(
                screen.getByRole("button", { name: "Undo" }),
            ).toBeInTheDocument();
        });

        it("names a meeting with an empty name Untitled meeting", async () => {
            backend.seed({ name: "", date: "2026-09-24" });
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Untitled meeting"',
                }),
            );

            expect(
                await screen.findByText('Archived "Untitled meeting".'),
            ).toBeInTheDocument();
        });

        it("says there are no meetings after the only meeting is archived", async () => {
            backend.seed({ name: "Weekly sync", date: "2026-09-24" });
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Weekly sync"',
                }),
            );

            expect(
                await screen.findByText("No meetings yet"),
            ).toBeInTheDocument();
            expect(
                screen.getByText('Archived "Weekly sync".'),
            ).toBeInTheDocument();
        });

        it("reaches the archive button with Tab from the meeting's link", async () => {
            backend.seed({ name: "Weekly sync", date: "2026-09-24" });
            const user = renderApp();

            const link = await screen.findByRole("link", {
                name: /Weekly sync/,
            });
            link.focus();
            await user.tab();

            expect(
                screen.getByRole("button", { name: 'Archive "Weekly sync"' }),
            ).toHaveFocus();
        });

        it("keeps the meeting and reports the problem when archiving fails", async () => {
            seedThreeMeetings();
            backend.failArchive = true;
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Standup"',
                }),
            );

            expect(
                await screen.findByText(
                    "Couldn't archive the meeting. Try again.",
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByRole("link", { name: /Standup/ }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole("button", { name: "Undo" }),
            ).not.toBeInTheDocument();
        });
    });

    describe("from the editor page", () => {
        it("archives the meeting and shows the Meetings page with Undo", async () => {
            const { standup } = seedThreeMeetings();
            const user = renderApp();

            await user.click(
                await screen.findByRole("link", { name: /Standup/ }),
            );
            await screen.findByRole("textbox", { name: "Notes" });
            await user.click(screen.getByRole("button", { name: "Archive" }));

            expect(invoke).toHaveBeenCalledWith("archive_meeting", {
                id: standup.id,
            });
            expect(
                await screen.findByText('Archived "Standup".'),
            ).toBeInTheDocument();
            expect(
                screen.getByRole("heading", { level: 1, name: "Meetings" }),
            ).toBeInTheDocument();
            // The notice appears before the list has loaded.
            await waitFor(() =>
                expect(listedMeetingNames()).toEqual([
                    "Weekly sync",
                    "Kickoff",
                ]),
            );
        });

        it("saves a change that was not yet saved", async () => {
            const user = renderApp();
            await user.click(
                await screen.findByRole("button", { name: "New note" }),
            );
            const notes = await screen.findByRole("textbox", { name: "Notes" });

            await user.type(notes, "Oops");
            await user.click(screen.getByRole("button", { name: "Archive" }));

            await waitFor(
                () => expect(backend.lastUpdate()?.notes.trim()).toBe("Oops"),
                SAVE_TIMEOUT,
            );
            expect(backend.meetings[0].notes.trim()).toBe("Oops");
            expect(backend.meetings[0].archivedAt).not.toBeNull();
        });

        it("stays on the editor page and reports the problem when archiving fails", async () => {
            backend.seed({ name: "Weekly sync", date: "2026-09-24" });
            backend.failArchive = true;
            const user = renderApp();

            await user.click(
                await screen.findByRole("link", { name: /Weekly sync/ }),
            );
            const notes = await screen.findByRole("textbox", { name: "Notes" });
            await user.type(notes, "Keep me");
            await user.click(screen.getByRole("button", { name: "Archive" }));

            expect(
                await screen.findByText(
                    "Couldn't archive the meeting. Try again.",
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByRole("textbox", { name: "Notes" }),
            ).toHaveTextContent("Keep me");
            expect(
                screen.getByRole("textbox", { name: "Meeting name" }),
            ).toHaveValue("Weekly sync");
        });
    });

    describe("Undo", () => {
        it("restores the meeting to its place in the list", async () => {
            const { standup } = seedThreeMeetings();
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Standup"',
                }),
            );
            await user.click(
                await screen.findByRole("button", { name: "Undo" }),
            );

            expect(invoke).toHaveBeenCalledWith("unarchive_meeting", {
                id: standup.id,
            });
            await waitFor(() =>
                expect(listedMeetingNames()).toEqual([
                    "Weekly sync",
                    "Standup",
                    "Kickoff",
                ]),
            );
            expect(
                screen.queryByText('Archived "Standup".'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole("button", { name: "Undo" }),
            ).not.toBeInTheDocument();
        });

        it("keeps the notice and reports the problem when restoring fails", async () => {
            seedThreeMeetings();
            backend.failUnarchive = true;
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Standup"',
                }),
            );
            await user.click(
                await screen.findByRole("button", { name: "Undo" }),
            );

            expect(
                await screen.findByText(
                    "Couldn't restore the meeting. Try again.",
                ),
            ).toBeInTheDocument();
            expect(screen.getByText('Archived "Standup".')).toBeInTheDocument();
            expect(
                screen.getByRole("button", { name: "Undo" }),
            ).toBeInTheDocument();
            expect(listedMeetingNames()).toEqual(["Weekly sync", "Kickoff"]);
        });

        it("restores only the meeting that was archived last", async () => {
            seedThreeMeetings();
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Standup"',
                }),
            );
            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Kickoff"',
                }),
            );

            expect(
                await screen.findByText('Archived "Kickoff".'),
            ).toBeInTheDocument();
            expect(
                screen.queryByText('Archived "Standup".'),
            ).not.toBeInTheDocument();

            await user.click(screen.getByRole("button", { name: "Undo" }));

            await waitFor(() =>
                expect(listedMeetingNames()).toEqual([
                    "Weekly sync",
                    "Kickoff",
                ]),
            );
        });

        it("disappears when the user opens another page", async () => {
            seedThreeMeetings();
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Standup"',
                }),
            );
            await screen.findByText('Archived "Standup".');

            await user.click(screen.getByRole("link", { name: /Kickoff/ }));
            await screen.findByRole("textbox", { name: "Notes" });
            await openMeetingsPage(user);

            await screen.findByRole("link", { name: /Kickoff/ });
            expect(
                screen.queryByText('Archived "Standup".'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole("button", { name: "Undo" }),
            ).not.toBeInTheDocument();
        });
    });

    describe("archived meetings", () => {
        it("stay hidden when the Meetings page opens again", async () => {
            seedThreeMeetings();
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Standup"',
                }),
            );
            await screen.findByText('Archived "Standup".');
            await user.click(screen.getByRole("button", { name: "New note" }));
            await screen.findByRole("textbox", { name: "Notes" });
            await openMeetingsPage(user);

            await screen.findByRole("link", { name: /Kickoff/ });
            expect(listedMeetingNames()).toEqual([
                "Untitled meeting",
                "Weekly sync",
                "Kickoff",
            ]);
        });

        it("keep their name, date, notes, and last change time", async () => {
            const standup = backend.seed({
                name: "Standup",
                date: "2026-09-22",
                notes: "- [ ] Follow up\n",
                updatedAt: "2026-09-22T09:00:00.000Z",
            });
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Standup"',
                }),
            );
            await screen.findByText('Archived "Standup".');

            expect(backend.find(standup.id)).toMatchObject({
                name: "Standup",
                date: "2026-09-22",
                notes: "- [ ] Follow up\n",
                updatedAt: "2026-09-22T09:00:00.000Z",
            });
            expect(
                invoke.mock.calls.some(
                    ([command]) => command === "update_meeting",
                ),
            ).toBe(false);
        });
    });
});
