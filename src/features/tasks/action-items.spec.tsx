import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

// Feature spec for docs/specs/0005-meeting-action-items.md.
// The Tauri backend is replaced by an in-memory fake of the meeting and task commands.

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

type Task = {
    id: number;
    meetingId: number | null;
    description: string;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
};

type Command =
    | "list_meeting_tasks"
    | "create_task"
    | "update_task_description"
    | "set_task_completed"
    | "delete_task";

class FakeBackend {
    meetings: Meeting[] = [];
    tasks: Task[] = [];
    /** Commands that reject instead of running. */
    failing = new Set<Command>();
    private nextMeetingId = 1;
    private nextTaskId = 1;
    private clock = 0;

    /** Returns a timestamp that is later than every timestamp returned before. */
    private now(): string {
        this.clock += 1;
        return new Date(Date.UTC(2026, 8, 24, 10, 0, this.clock)).toISOString();
    }

    seedMeeting(name: string): Meeting {
        const now = this.now();
        const meeting: Meeting = {
            id: this.nextMeetingId++,
            name,
            date: "2026-09-24",
            notes: "",
            createdAt: now,
            updatedAt: now,
        };
        this.meetings.push(meeting);
        return meeting;
    }

    seedTask(meetingId: number, description: string, completed = false): Task {
        const now = this.now();
        const task: Task = {
            id: this.nextTaskId++,
            meetingId,
            description,
            createdAt: now,
            updatedAt: now,
            completedAt: completed ? now : null,
        };
        this.tasks.push(task);
        return task;
    }

    findTask(id: number): Task | undefined {
        return this.tasks.find((t) => t.id === id);
    }

    private storedTask(id: unknown): Task {
        const task = this.findTask(id as number);
        if (!task) throw `task ${String(id)} not found`;
        return task;
    }

    private failIfAsked(command: Command) {
        if (this.failing.has(command)) throw "database is locked";
    }

    handle = async (
        command: string,
        args: Record<string, unknown> = {},
    ): Promise<unknown> => {
        switch (command) {
            case "list_meetings":
                return this.meetings.map(({ id, name, date, updatedAt }) => ({
                    id,
                    name,
                    date,
                    updatedAt,
                }));
            case "get_meeting":
                return this.meetings.find((m) => m.id === args.id) ?? null;
            case "update_meeting": {
                const meeting = this.meetings.find((m) => m.id === args.id);
                if (!meeting) throw `meeting ${String(args.id)} not found`;
                Object.assign(meeting, {
                    name: args.name,
                    date: args.date,
                    notes: args.notes,
                    updatedAt: this.now(),
                });
                return meeting;
            }
            case "list_meeting_tasks":
                this.failIfAsked(command);
                return this.tasks
                    .filter((t) => t.meetingId === args.meetingId)
                    .sort(
                        (a, b) =>
                            a.createdAt.localeCompare(b.createdAt) ||
                            a.id - b.id,
                    )
                    .map((t) => ({ ...t }));
            case "create_task": {
                this.failIfAsked(command);
                if (!this.meetings.some((m) => m.id === args.meetingId)) {
                    throw `meeting ${String(args.meetingId)} not found`;
                }
                return {
                    ...this.seedTask(
                        args.meetingId as number,
                        args.description as string,
                    ),
                };
            }
            case "update_task_description": {
                this.failIfAsked(command);
                const task = this.storedTask(args.id);
                task.description = args.description as string;
                task.updatedAt = this.now();
                return { ...task };
            }
            case "set_task_completed": {
                this.failIfAsked(command);
                const task = this.storedTask(args.id);
                const now = this.now();
                task.completedAt = args.completed
                    ? (task.completedAt ?? now)
                    : null;
                task.updatedAt = now;
                return { ...task };
            }
            case "delete_task": {
                this.failIfAsked(command);
                this.storedTask(args.id);
                this.tasks = this.tasks.filter((t) => t.id !== args.id);
                return null;
            }
            default:
                throw `unexpected command ${command}`;
        }
    };

    /** The arguments of every call of `command`, in the order the calls were made. */
    callsOf(command: string): Record<string, unknown>[] {
        return invoke.mock.calls
            .filter(([name]) => name === command)
            .map(([, args]) => args as Record<string, unknown>);
    }
}

const SAVE_TIMEOUT = { timeout: 2000 };

let backend: FakeBackend;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    invoke.mockImplementation(backend.handle);
});

type User = ReturnType<typeof userEvent.setup>;

/** Starts the application and opens the editor page of the meeting named `name`. */
async function openMeeting(name: string): Promise<User> {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
        await screen.findByRole("link", { name: new RegExp(`^${name}`) }),
    );
    await screen.findByRole("textbox", { name: "Notes" });
    return user;
}

/** Opens the Meetings page from the sidebar, then opens the meeting named `name` again. */
async function reopenMeeting(user: User, name: string) {
    await user.click(
        within(screen.getByRole("navigation", { name: "Main" })).getByRole(
            "link",
            { name: "Meetings" },
        ),
    );
    await user.click(
        await screen.findByRole("link", { name: new RegExp(`^${name}`) }),
    );
    await screen.findByRole("textbox", { name: "Notes" });
}

function panel() {
    return screen.getByRole("region", { name: "Action items" });
}

function addField() {
    return within(panel()).getByRole("textbox", { name: "Add action item" });
}

function itemFields(): HTMLInputElement[] {
    return within(panel()).queryAllByRole("textbox", {
        name: "Action item",
    }) as HTMLInputElement[];
}

/** The texts of the action items, in the order shown. */
function listedItems(): string[] {
    return itemFields().map((field) => field.value);
}

/** Waits until the panel shows the action items `texts`, in this order. */
async function expectItems(texts: string[]) {
    await waitFor(() => expect(listedItems()).toEqual(texts));
}

function itemField(text: string) {
    const field = itemFields().find((f) => f.value === text);
    if (!field) throw new Error(`no action item "${text}"`);
    return field;
}

function checkbox(text: string) {
    return within(panel()).getByRole("checkbox", {
        name: `Complete "${text}"`,
    });
}

function removeButton(text: string) {
    return within(panel()).getByRole("button", { name: `Remove "${text}"` });
}

/** Waits until the panel shows the alert `text`. */
async function findAlert(text: string) {
    await waitFor(
        () =>
            expect(within(panel()).getByRole("alert")).toHaveTextContent(text),
        SAVE_TIMEOUT,
    );
}

describe("Meeting action items", () => {
    describe("panel", () => {
        it("shows a heading, an empty list, and the Add action item field", async () => {
            backend.seedMeeting("Weekly sync");
            await openMeeting("Weekly sync");

            const region = await screen.findByRole("region", {
                name: "Action items",
            });
            expect(
                within(region).getByRole("heading", { name: "Action items" }),
            ).toBeInTheDocument();
            expect(
                await within(region).findByText("No action items yet"),
            ).toBeInTheDocument();
            expect(addField()).toBeInTheDocument();
            expect(itemFields()).toEqual([]);
        });

        it("shows only the meeting's own items, oldest first, with their done state", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const standup = backend.seedMeeting("Standup");
            backend.seedTask(sync.id, "Send the deck");
            backend.seedTask(standup.id, "Fix the build");
            backend.seedTask(sync.id, "Book a room", true);
            backend.seedTask(sync.id, "Call Sam");
            await openMeeting("Weekly sync");

            await expectItems(["Send the deck", "Book a room", "Call Sam"]);
            expect(checkbox("Send the deck")).not.toBeChecked();
            expect(checkbox("Book a room")).toBeChecked();
            expect(checkbox("Call Sam")).not.toBeChecked();
            expect(removeButton("Book a room")).toBeInTheDocument();
            expect(
                within(panel()).queryByText("No action items yet"),
            ).not.toBeInTheDocument();
        });

        it("names an item with empty text Untitled action item", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask(sync.id, "");
            await openMeeting("Weekly sync");

            await expectItems([""]);
            expect(checkbox("Untitled action item")).toBeInTheDocument();
            expect(removeButton("Untitled action item")).toBeInTheDocument();
        });

        it("reports a failed load and loads again on Retry", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask(sync.id, "Send the deck");
            backend.failing.add("list_meeting_tasks");
            const user = await openMeeting("Weekly sync");

            expect(
                await within(panel()).findByText("Couldn't load action items"),
            ).toBeInTheDocument();
            // The rest of the editor page still works.
            expect(
                screen.getByRole("textbox", { name: "Meeting name" }),
            ).toHaveValue("Weekly sync");

            backend.failing.delete("list_meeting_tasks");
            await user.click(
                within(panel()).getByRole("button", { name: "Retry" }),
            );

            await expectItems(["Send the deck"]);
        });
    });

    describe("adding", () => {
        it("adds the item at the bottom, empties the field, and keeps the focus there", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask(sync.id, "Send the deck");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(addField());
            await user.keyboard("  Call Sam  {Enter}");

            await expectItems(["Send the deck", "Call Sam"]);
            expect(backend.callsOf("create_task")).toEqual([
                { meetingId: sync.id, description: "Call Sam" },
            ]);
            expect(checkbox("Call Sam")).not.toBeChecked();
            expect(addField()).toHaveValue("");
            expect(addField()).toHaveFocus();

            await user.keyboard("Book a room{Enter}");

            await expectItems(["Send the deck", "Call Sam", "Book a room"]);
        });

        it("does nothing when the field is empty or has only spaces", async () => {
            backend.seedMeeting("Weekly sync");
            const user = await openMeeting("Weekly sync");
            await within(panel()).findByText("No action items yet");

            await user.click(addField());
            await user.keyboard("{Enter}   {Enter}");

            expect(backend.callsOf("create_task")).toEqual([]);
            expect(itemFields()).toEqual([]);
        });

        it("keeps the text and reports the problem when adding fails", async () => {
            backend.seedMeeting("Weekly sync");
            backend.failing.add("create_task");
            const user = await openMeeting("Weekly sync");
            await within(panel()).findByText("No action items yet");

            await user.click(addField());
            await user.keyboard("Call Sam{Enter}");

            await findAlert("Couldn't add the action item. Try again.");
            expect(itemFields()).toEqual([]);
            expect(addField()).toHaveValue("Call Sam");
        });

        it("keeps added items after the user leaves and opens the meeting again", async () => {
            backend.seedMeeting("Weekly sync");
            const user = await openMeeting("Weekly sync");
            await within(panel()).findByText("No action items yet");
            await user.click(addField());
            await user.keyboard("Call Sam{Enter}");
            await expectItems(["Call Sam"]);

            await reopenMeeting(user, "Weekly sync");

            await expectItems(["Call Sam"]);
        });
    });

    describe("checking off", () => {
        it("saves the item as done at once, and as not done when unchecked", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const deck = backend.seedTask(sync.id, "Send the deck");
            backend.seedTask(sync.id, "Call Sam");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck", "Call Sam"]);

            await user.click(checkbox("Send the deck"));

            await waitFor(() =>
                expect(backend.findTask(deck.id)?.completedAt).not.toBeNull(),
            );
            expect(backend.callsOf("set_task_completed")).toEqual([
                { id: deck.id, completed: true },
            ]);
            expect(checkbox("Send the deck")).toBeChecked();
            // A checked item stays in its place.
            expect(listedItems()).toEqual(["Send the deck", "Call Sam"]);

            await user.click(checkbox("Send the deck"));

            await waitFor(() =>
                expect(backend.findTask(deck.id)?.completedAt).toBeNull(),
            );
            expect(backend.callsOf("set_task_completed")).toEqual([
                { id: deck.id, completed: true },
                { id: deck.id, completed: false },
            ]);
            expect(checkbox("Send the deck")).not.toBeChecked();
        });

        it("keeps the done state after the user leaves and opens the meeting again", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask(sync.id, "Send the deck");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);
            await user.click(checkbox("Send the deck"));
            await waitFor(() =>
                expect(backend.callsOf("set_task_completed")).toHaveLength(1),
            );

            await reopenMeeting(user, "Weekly sync");

            await expectItems(["Send the deck"]);
            expect(checkbox("Send the deck")).toBeChecked();
        });

        it("puts the checkbox back and reports the problem when the change fails", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask(sync.id, "Send the deck");
            backend.failing.add("set_task_completed");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(checkbox("Send the deck"));

            await findAlert("Couldn't save the action item. Try again.");
            expect(checkbox("Send the deck")).not.toBeChecked();
        });
    });

    describe("changing the text", () => {
        it("saves the new text after a pause and renames the item's controls", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const deck = backend.seedTask(sync.id, "Send the deck");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(itemField("Send the deck"));
            await user.keyboard(" to Alex");

            await waitFor(
                () =>
                    expect(backend.findTask(deck.id)?.description).toBe(
                        "Send the deck to Alex",
                    ),
                SAVE_TIMEOUT,
            );
            expect(backend.callsOf("update_task_description")).toContainEqual({
                id: deck.id,
                description: "Send the deck to Alex",
            });
            expect(checkbox("Send the deck to Alex")).toBeInTheDocument();
            expect(removeButton("Send the deck to Alex")).toBeInTheDocument();
        });

        it("changes the text of a checked item", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const room = backend.seedTask(sync.id, "Book a room", true);
            const user = await openMeeting("Weekly sync");
            await expectItems(["Book a room"]);

            await user.click(itemField("Book a room"));
            await user.keyboard(" for Friday");

            await waitFor(
                () =>
                    expect(backend.findTask(room.id)?.description).toBe(
                        "Book a room for Friday",
                    ),
                SAVE_TIMEOUT,
            );
            expect(checkbox("Book a room for Friday")).toBeChecked();
        });

        it("saves a waiting change at once when the user leaves the page", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const deck = backend.seedTask(sync.id, "Send the deck");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(itemField("Send the deck"));
            await user.keyboard(" now");
            await user.click(
                within(
                    screen.getByRole("navigation", { name: "Main" }),
                ).getByRole("link", { name: "Meetings" }),
            );

            await waitFor(() =>
                expect(backend.findTask(deck.id)?.description).toBe(
                    "Send the deck now",
                ),
            );
        });

        it("keeps the text and reports the problem when saving fails", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const deck = backend.seedTask(sync.id, "Send the deck");
            backend.failing.add("update_task_description");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(itemField("Send the deck"));
            await user.keyboard(" to Alex");

            await findAlert("Couldn't save the action item. Try again.");
            expect(listedItems()).toEqual(["Send the deck to Alex"]);

            backend.failing.delete("update_task_description");
            await user.keyboard("!");

            await waitFor(
                () =>
                    expect(backend.findTask(deck.id)?.description).toBe(
                        "Send the deck to Alex!",
                    ),
                SAVE_TIMEOUT,
            );
            await waitFor(() =>
                expect(
                    within(panel()).queryByRole("alert"),
                ).not.toBeInTheDocument(),
            );
        });
    });

    describe("removing", () => {
        function seedThreeItems() {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask(sync.id, "Send the deck");
            const room = backend.seedTask(sync.id, "Book a room");
            backend.seedTask(sync.id, "Call Sam");
            return { room };
        }

        it("deletes the item and moves focus to the next item", async () => {
            const { room } = seedThreeItems();
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck", "Book a room", "Call Sam"]);

            await user.click(removeButton("Book a room"));

            await expectItems(["Send the deck", "Call Sam"]);
            expect(backend.callsOf("delete_task")).toEqual([{ id: room.id }]);
            expect(backend.findTask(room.id)).toBeUndefined();
            await waitFor(() => expect(itemField("Call Sam")).toHaveFocus());
        });

        it("moves focus to the item before when the last item is removed", async () => {
            seedThreeItems();
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck", "Book a room", "Call Sam"]);

            await user.click(removeButton("Call Sam"));

            await expectItems(["Send the deck", "Book a room"]);
            await waitFor(() => expect(itemField("Book a room")).toHaveFocus());
        });

        it("moves focus to the Add action item field when the list becomes empty", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask(sync.id, "Send the deck");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(removeButton("Send the deck"));

            await expectItems([]);
            expect(
                within(panel()).getByText("No action items yet"),
            ).toBeInTheDocument();
            await waitFor(() => expect(addField()).toHaveFocus());
        });

        it("discards a waiting text change without an error", async () => {
            const { room } = seedThreeItems();
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck", "Book a room", "Call Sam"]);

            await user.click(itemField("Book a room"));
            await user.keyboard(" for Friday");
            await user.click(removeButton("Book a room for Friday"));

            await expectItems(["Send the deck", "Call Sam"]);
            // Wait longer than the pause before an automatic save.
            await new Promise((resolve) => setTimeout(resolve, 800));
            expect(backend.findTask(room.id)).toBeUndefined();
            expect(
                within(panel()).queryByRole("alert"),
            ).not.toBeInTheDocument();
        });

        it("keeps the item and reports the problem when removing fails", async () => {
            seedThreeItems();
            backend.failing.add("delete_task");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck", "Book a room", "Call Sam"]);

            await user.click(removeButton("Book a room"));

            await findAlert("Couldn't remove the action item. Try again.");
            expect(listedItems()).toEqual([
                "Send the deck",
                "Book a room",
                "Call Sam",
            ]);
        });
    });

    describe("messages", () => {
        it("replaces the message with a newer one and clears it after the next success", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask(sync.id, "Send the deck");
            backend.failing.add("create_task");
            backend.failing.add("delete_task");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(addField());
            await user.keyboard("Call Sam{Enter}");
            await findAlert("Couldn't add the action item. Try again.");

            await user.click(removeButton("Send the deck"));
            await findAlert("Couldn't remove the action item. Try again.");
            expect(within(panel()).getAllByRole("alert")).toHaveLength(1);

            await user.click(checkbox("Send the deck"));

            await waitFor(() =>
                expect(
                    within(panel()).queryByRole("alert"),
                ).not.toBeInTheDocument(),
            );
        });
    });
});
