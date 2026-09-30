import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeBackend, type StoredTask } from "@/test/fake-backend";

// Feature spec for docs/specs/0005-meeting-action-items.md, with the words of
// docs/specs/0007-deleted-rows-and-ranked-order.md and the changes of
// docs/specs/0010-work-section.md. The action items on the Work page are checked in
// action-items-work.spec.tsx.
// The Tauri backend is replaced by an in-memory fake of the backend commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

/** The arguments of every call of `command`, in the order the calls were made. */
function callsOf(command: string): Record<string, unknown>[] {
    return invoke.mock.calls
        .filter(([name]) => name === command)
        .map(([, args]) => args as Record<string, unknown>);
}

function findTask(id: number): StoredTask | undefined {
    return backend.tasks.find((t) => t.id === id);
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

function openButton(text: string) {
    return within(panel()).getByRole("button", { name: `Open "${text}"` });
}

/** The region that holds the toasts. */
function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

/** The texts of the failure toasts that are open. */
function failureToasts(): string[] {
    return within(notifications())
        .queryAllByText(/^Couldn't .* Try again\.$/)
        .map((element) => element.textContent ?? "");
}

/**
 * Waits until the only failure toast says `text`, and checks that the panel shows no
 * alert of its own.
 */
async function findFailureToast(text: string) {
    await waitFor(() => expect(failureToasts()).toEqual([text]), SAVE_TIMEOUT);
    expect(within(panel()).queryByRole("alert")).not.toBeInTheDocument();
}

/** Waits until no failure toast is open. */
async function expectNoFailureToast() {
    await waitFor(() => expect(failureToasts()).toEqual([]));
}

function sidebar() {
    return screen.getByRole("complementary", { name: "Meeting details" });
}

/** Returns true if `first` comes before `second` in the page. */
function isBefore(first: Element, second: Element) {
    return Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
}

describe("Meeting details sidebar", () => {
    it("shows the date and the Delete button above the action items", async () => {
        backend.seedMeeting("Weekly sync");
        await openMeeting("Weekly sync");

        const aside = await screen.findByRole("complementary", {
            name: "Meeting details",
        });
        const date = within(aside).getByLabelText("Meeting date");
        const deleteButton = within(aside).getByRole("button", {
            name: "Delete",
        });
        const actionItems = within(aside).getByRole("region", {
            name: "Action items",
        });
        expect(date).toHaveValue("2026-09-24");
        expect(within(aside).getByText("Date")).toBeInTheDocument();
        expect(isBefore(date, deleteButton)).toBe(true);
        expect(isBefore(deleteButton, actionItems)).toBe(true);
        // The page has one Delete button, so the page header no longer has one.
        expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(
            1,
        );
        // The meeting name stays in the main area, outside the sidebar.
        expect(
            within(aside).queryByRole("textbox", { name: "Meeting name" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("textbox", { name: "Meeting name" }),
        ).toHaveValue("Weekly sync");
    });

    it("saves a change to the date made in the sidebar", async () => {
        const sync = backend.seedMeeting("Weekly sync");
        await openMeeting("Weekly sync");

        fireEvent.change(within(sidebar()).getByLabelText("Meeting date"), {
            target: { value: "2026-09-25" },
        });

        await waitFor(
            () =>
                expect(
                    backend.meetings.find((m) => m.id === sync.id)?.date,
                ).toBe("2026-09-25"),
            SAVE_TIMEOUT,
        );
    });
});

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
            backend.seedTask({ meeting: sync, title: "Send the deck" });
            backend.seedTask({ meeting: standup, title: "Fix the build" });
            backend.seedTask({
                meeting: sync,
                title: "Book a room",
                stage: "done",
            });
            backend.seedTask({ meeting: sync, title: "Call Sam" });
            await openMeeting("Weekly sync");

            await expectItems(["Send the deck", "Book a room", "Call Sam"]);
            expect(checkbox("Send the deck")).not.toBeChecked();
            expect(checkbox("Book a room")).toBeChecked();
            expect(checkbox("Call Sam")).not.toBeChecked();
            expect(removeButton("Book a room")).toBeInTheDocument();
            expect(openButton("Book a room")).toBeInTheDocument();
            expect(
                within(panel()).queryByText("No action items yet"),
            ).not.toBeInTheDocument();
        });

        it("names an item with empty text Untitled action item", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask({ meeting: sync, title: "" });
            await openMeeting("Weekly sync");

            await expectItems([""]);
            expect(checkbox("Untitled action item")).toBeInTheDocument();
            expect(removeButton("Untitled action item")).toBeInTheDocument();
            expect(openButton("Untitled action item")).toBeInTheDocument();
        });

        it("reports a failed load and loads again on Retry", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask({ meeting: sync, title: "Send the deck" });
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
        it("replaces line breaks in pasted text with spaces", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const user = await openMeeting("Weekly sync");
            await within(panel()).findByText("No action items yet");

            await user.click(addField());
            await user.paste("Call Sam\nabout the deck");

            expect(addField()).toHaveValue("Call Sam about the deck");

            await user.keyboard("{Enter}");

            await expectItems(["Call Sam about the deck"]);
            expect(callsOf("create_meeting_task")).toEqual([
                { meetingId: sync.id, title: "Call Sam about the deck" },
            ]);
            expect(addField()).toHaveValue("");
        });

        it("adds the item at the bottom, empties the field, and keeps the focus there", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask({ meeting: sync, title: "Send the deck" });
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(addField());
            await user.keyboard("  Call Sam  {Enter}");

            await expectItems(["Send the deck", "Call Sam"]);
            expect(callsOf("create_meeting_task")).toEqual([
                { meetingId: sync.id, title: "Call Sam" },
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

            expect(callsOf("create_meeting_task")).toEqual([]);
            expect(itemFields()).toEqual([]);
        });

        it("keeps the text and reports the problem when adding fails", async () => {
            backend.seedMeeting("Weekly sync");
            backend.failing.add("create_meeting_task");
            const user = await openMeeting("Weekly sync");
            await within(panel()).findByText("No action items yet");

            await user.click(addField());
            await user.keyboard("Call Sam{Enter}");

            await findFailureToast("Couldn't add the action item. Try again.");
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
            const deck = backend.seedTask({
                meeting: sync,
                title: "Send the deck",
            });
            backend.seedTask({ meeting: sync, title: "Call Sam" });
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck", "Call Sam"]);

            await user.click(checkbox("Send the deck"));

            await waitFor(() =>
                expect(findTask(deck.id)?.completedAt).not.toBeNull(),
            );
            expect(callsOf("set_task_completed")).toEqual([
                { id: deck.id, completed: true },
            ]);
            expect(checkbox("Send the deck")).toBeChecked();
            // A checked item stays in its place.
            expect(listedItems()).toEqual(["Send the deck", "Call Sam"]);

            await user.click(checkbox("Send the deck"));

            await waitFor(() =>
                expect(findTask(deck.id)?.completedAt).toBeNull(),
            );
            expect(callsOf("set_task_completed")).toEqual([
                { id: deck.id, completed: true },
                { id: deck.id, completed: false },
            ]);
            expect(checkbox("Send the deck")).not.toBeChecked();
        });

        it("keeps the done state after the user leaves and opens the meeting again", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask({ meeting: sync, title: "Send the deck" });
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);
            await user.click(checkbox("Send the deck"));
            await waitFor(() =>
                expect(callsOf("set_task_completed")).toHaveLength(1),
            );

            await reopenMeeting(user, "Weekly sync");

            await expectItems(["Send the deck"]);
            expect(checkbox("Send the deck")).toBeChecked();
        });

        it("puts the checkbox back and reports the problem when the change fails", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask({ meeting: sync, title: "Send the deck" });
            backend.failing.add("set_task_completed");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(checkbox("Send the deck"));

            await findFailureToast("Couldn't save the action item. Try again.");
            expect(checkbox("Send the deck")).not.toBeChecked();
        });
    });

    describe("changing the text", () => {
        it("does not add a line break when the user presses Enter", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const deck = backend.seedTask({
                meeting: sync,
                title: "Send the deck",
            });
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(itemField("Send the deck"));
            await user.keyboard("{Enter} today");

            expect(listedItems()).toEqual(["Send the deck today"]);
            await waitFor(
                () =>
                    expect(findTask(deck.id)?.title).toBe(
                        "Send the deck today",
                    ),
                SAVE_TIMEOUT,
            );
        });

        it("replaces line breaks in pasted text with spaces", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask({ meeting: sync, title: "Send the deck" });
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(itemField("Send the deck"));
            await user.paste(" to Alex\nand Sam");

            expect(listedItems()).toEqual(["Send the deck to Alex and Sam"]);
        });

        it("saves the new text after a pause and renames the item's controls", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const deck = backend.seedTask({
                meeting: sync,
                title: "Send the deck",
            });
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(itemField("Send the deck"));
            await user.keyboard(" to Alex");

            await waitFor(
                () =>
                    expect(findTask(deck.id)?.title).toBe(
                        "Send the deck to Alex",
                    ),
                SAVE_TIMEOUT,
            );
            expect(callsOf("update_task_title")).toContainEqual({
                id: deck.id,
                title: "Send the deck to Alex",
            });
            expect(checkbox("Send the deck to Alex")).toBeInTheDocument();
            expect(removeButton("Send the deck to Alex")).toBeInTheDocument();
            expect(openButton("Send the deck to Alex")).toBeInTheDocument();
        });

        it("changes the text of a checked item", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const room = backend.seedTask({
                meeting: sync,
                title: "Book a room",
                stage: "done",
            });
            const user = await openMeeting("Weekly sync");
            await expectItems(["Book a room"]);

            await user.click(itemField("Book a room"));
            await user.keyboard(" for Friday");

            await waitFor(
                () =>
                    expect(findTask(room.id)?.title).toBe(
                        "Book a room for Friday",
                    ),
                SAVE_TIMEOUT,
            );
            expect(checkbox("Book a room for Friday")).toBeChecked();
        });

        it("saves a waiting change at once when the user leaves the page", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const deck = backend.seedTask({
                meeting: sync,
                title: "Send the deck",
            });
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
                expect(findTask(deck.id)?.title).toBe("Send the deck now"),
            );
        });

        it("keeps the text and reports the problem when saving fails", async () => {
            const sync = backend.seedMeeting("Weekly sync");
            const deck = backend.seedTask({
                meeting: sync,
                title: "Send the deck",
            });
            backend.failing.add("update_task_title");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(itemField("Send the deck"));
            await user.keyboard(" to Alex");

            await findFailureToast("Couldn't save the action item. Try again.");
            expect(listedItems()).toEqual(["Send the deck to Alex"]);

            backend.failing.delete("update_task_title");
            await user.keyboard("!");

            await waitFor(
                () =>
                    expect(findTask(deck.id)?.title).toBe(
                        "Send the deck to Alex!",
                    ),
                SAVE_TIMEOUT,
            );
            await expectNoFailureToast();
        });
    });

    describe("removing", () => {
        function seedThreeItems() {
            const sync = backend.seedMeeting("Weekly sync");
            backend.seedTask({ meeting: sync, title: "Send the deck" });
            const room = backend.seedTask({
                meeting: sync,
                title: "Book a room",
            });
            backend.seedTask({ meeting: sync, title: "Call Sam" });
            return { room };
        }

        it("deletes the item and moves focus to the next item", async () => {
            const { room } = seedThreeItems();
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck", "Book a room", "Call Sam"]);

            await user.click(removeButton("Book a room"));

            await expectItems(["Send the deck", "Call Sam"]);
            expect(callsOf("delete_task")).toEqual([{ id: room.id }]);
            // The task is deleted, not removed for good, so that it can be restored.
            expect(findTask(room.id)?.deletedAt).not.toBeNull();
            expect(
                await within(notifications()).findByText(
                    'Deleted "Book a room".',
                ),
            ).toBeInTheDocument();
            expect(
                within(notifications()).getByRole("button", { name: "Undo" }),
            ).toBeInTheDocument();
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
            backend.seedTask({ meeting: sync, title: "Send the deck" });
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
            expect(findTask(room.id)).toMatchObject({ title: "Book a room" });
            expect(findTask(room.id)?.deletedAt).not.toBeNull();
            expect(failureToasts()).toEqual([]);
        });

        it("keeps the item and reports the problem when removing fails", async () => {
            seedThreeItems();
            backend.failing.add("delete_task");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck", "Book a room", "Call Sam"]);

            await user.click(removeButton("Book a room"));

            await findFailureToast(
                "Couldn't remove the action item. Try again.",
            );
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
            backend.seedTask({ meeting: sync, title: "Send the deck" });
            backend.failing.add("create_meeting_task");
            backend.failing.add("delete_task");
            const user = await openMeeting("Weekly sync");
            await expectItems(["Send the deck"]);

            await user.click(addField());
            await user.keyboard("Call Sam{Enter}");
            await findFailureToast("Couldn't add the action item. Try again.");

            await user.click(removeButton("Send the deck"));
            await findFailureToast(
                "Couldn't remove the action item. Try again.",
            );

            await user.click(checkbox("Send the deck"));

            await expectNoFailureToast();
        });

        it("shows a failure toast with only a Close button, which closes it", async () => {
            backend.seedMeeting("Weekly sync");
            backend.failing.add("create_meeting_task");
            const user = await openMeeting("Weekly sync");
            await within(panel()).findByText("No action items yet");

            await user.click(addField());
            await user.keyboard("Call Sam{Enter}");
            await findFailureToast("Couldn't add the action item. Try again.");

            expect(
                within(notifications())
                    .getAllByRole("button")
                    .map(
                        (button) =>
                            button.getAttribute("aria-label") ??
                            button.textContent,
                    ),
            ).toEqual(["Close"]);
            expect(addField()).toHaveFocus();

            await user.click(
                within(notifications()).getByRole("button", { name: "Close" }),
            );

            await expectNoFailureToast();
        });
    });
});
