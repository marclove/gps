import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeBackend, type StoredProject } from "@/test/fake-backend";

// Feature spec for the action items of a meeting as tasks, in
// docs/specs/0010-work-section.md. The rest of the action items panel is checked in
// action-items.spec.tsx.
// The Tauri backend is replaced by an in-memory fake of the backend commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeBackend;
let checkout: StoredProject;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    checkout = backend.seedProject("Checkout");
    invoke.mockImplementation(backend.handle);
});

type User = ReturnType<typeof userEvent.setup>;

type ColumnName = "Current" | "Backlog" | "Icebox" | "Done";

/** Autosave waits for a pause, so a save can take longer than the default timeout. */
const SAVE_TIMEOUT = { timeout: 2000 };

function mainNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

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
        within(mainNavigation()).getByRole("link", { name: "Meetings" }),
    );
    await user.click(
        await screen.findByRole("link", { name: new RegExp(`^${name}`) }),
    );
    await screen.findByRole("textbox", { name: "Notes" });
}

/**
 * Opens the Work page from the sidebar. The specs then wait for a card, because the columns
 * show no cards while the tasks load.
 */
async function goToWork(user: User) {
    await user.click(
        within(mainNavigation()).getByRole("link", { name: "Work" }),
    );
    await screen.findByRole("region", { name: "Icebox" });
}

function column(name: ColumnName) {
    return screen.getByRole("region", { name });
}

function escape(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The card of the task in the column, found by its button, whose name starts with the title. */
function findCard(name: ColumnName, title: string) {
    return within(column(name)).findByRole("button", {
        name: new RegExp(`^${escape(title)}`),
    });
}

/**
 * The titles among `titles` that have a card in the column, in the order of the cards from
 * the top.
 */
function cardOrder(name: ColumnName, titles: string[]): string[] {
    const cards = titles.flatMap((title) =>
        within(column(name))
            .queryAllByRole("button", {
                name: new RegExp(`^${escape(title)}`),
            })
            .map((card) => ({ title, card })),
    );
    return cards
        .sort((a, b) =>
            a.card.compareDocumentPosition(b.card) &
            Node.DOCUMENT_POSITION_FOLLOWING
                ? -1
                : 1,
        )
        .map(({ title }) => title);
}

function panel(options: { hidden?: boolean } = {}) {
    return screen.getByRole("region", { name: "Action items", ...options });
}

function addField() {
    return within(panel()).getByRole("textbox", { name: "Add action item" });
}

/** The texts of the action items, in the order shown. */
function listedItems(options: { hidden?: boolean } = {}): string[] {
    return within(panel(options))
        .queryAllByRole("textbox", { name: "Action item", ...options })
        .map((field) => (field as HTMLInputElement).value);
}

async function expectItems(texts: string[]) {
    await waitFor(() => expect(listedItems()).toEqual(texts));
}

function itemField(text: string) {
    const field = within(panel())
        .getAllByRole("textbox", { name: "Action item" })
        .find((f) => (f as HTMLInputElement).value === text);
    if (!field) throw new Error(`no action item "${text}"`);
    return field;
}

function checkbox(text: string) {
    return within(panel()).getByRole("checkbox", {
        name: `Complete "${text}"`,
    });
}

function openButton(text: string) {
    return within(panel()).getByRole("button", { name: `Open "${text}"` });
}

function removeButton(text: string) {
    return within(panel()).getByRole("button", { name: `Remove "${text}"` });
}

/** Opens the task sheet of the action item, and waits until the task has loaded. */
async function openTaskSheet(user: User, text: string) {
    await user.click(openButton(text));
    const sheet = await screen.findByRole("dialog", { name: text });
    await waitFor(() => expect(titleField(sheet)).toBeEnabled());
    return sheet;
}

function titleField(sheet: HTMLElement) {
    return within(sheet).getByRole("textbox", { name: "Task title" });
}

function selectedText(sheet: HTMLElement, name: "Project" | "Initiative") {
    return within(sheet).getByRole<HTMLSelectElement>("combobox", { name })
        .selectedOptions[0]?.text;
}

function follows(first: Element, second: Element) {
    return Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
}

describe("A new action item", () => {
    it("appears at the top of the Icebox on the Work page, with the project of the meeting", async () => {
        backend.seedTask({ title: "Older task" });
        backend.seedMeeting("Weekly sync", [], { project: checkout });
        const user = await openMeeting("Weekly sync");
        await within(panel()).findByText("No action items yet");

        await user.click(addField());
        await user.keyboard("Call Sam{Enter}");
        await expectItems(["Call Sam"]);

        await goToWork(user);

        const card = await findCard("Icebox", "Call Sam");
        expect(within(card).getByText("Checkout")).toBeInTheDocument();
        expect(cardOrder("Icebox", ["Call Sam", "Older task"])).toEqual([
            "Call Sam",
            "Older task",
        ]);
        expect(backend.stageOf(backend.findTask("Call Sam"))).toBe("icebox");
    });

    it("gets the initiative of a meeting that covers exactly one initiative that is not deleted", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        const old = backend.seedInitiative({
            name: "Old",
            project: checkout,
            deleted: true,
        });
        backend.seedMeeting("Weekly sync", [launch.id, old.id]);
        const user = await openMeeting("Weekly sync");
        await within(panel()).findByText("No action items yet");

        await user.click(addField());
        await user.keyboard("Call Sam{Enter}");
        await expectItems(["Call Sam"]);
        const sheet = await openTaskSheet(user, "Call Sam");

        expect(selectedText(sheet, "Project")).toBe("Checkout");
        expect(selectedText(sheet, "Initiative")).toBe("Launch");
        expect(backend.findTask("Call Sam")).toMatchObject({
            projectId: checkout.id,
            initiativeId: launch.id,
        });
    });

    it("gets no initiative when the meeting covers several initiatives", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        const pilot = backend.seedInitiative({
            name: "Pilot",
            project: checkout,
        });
        backend.seedMeeting("Weekly sync", [launch.id, pilot.id]);
        const user = await openMeeting("Weekly sync");
        await within(panel()).findByText("No action items yet");

        await user.click(addField());
        await user.keyboard("Call Sam{Enter}");
        await expectItems(["Call Sam"]);
        const sheet = await openTaskSheet(user, "Call Sam");

        expect(selectedText(sheet, "Project")).toBe("Checkout");
        expect(selectedText(sheet, "Initiative")).toBe("No initiative");
    });

    it("gets no project and no initiative when the meeting has no project", async () => {
        backend.seedMeeting("Weekly sync");
        const user = await openMeeting("Weekly sync");
        await within(panel()).findByText("No action items yet");

        await user.click(addField());
        await user.keyboard("Call Sam{Enter}");
        await expectItems(["Call Sam"]);
        await goToWork(user);

        const card = await findCard("Icebox", "Call Sam");
        expect(within(card).queryByText("Checkout")).not.toBeInTheDocument();
        expect(backend.findTask("Call Sam")).toMatchObject({
            projectId: null,
            initiativeId: null,
        });
    });
});

describe("Checking off an action item", () => {
    it("moves the task to Done, and unchecking it returns the task to its held place", async () => {
        const sync = backend.seedMeeting("Weekly sync");
        backend.seedTask({ title: "First", stage: "backlog" });
        backend.seedTask({
            title: "Send the deck",
            meeting: sync,
            stage: "backlog",
        });
        backend.seedTask({ title: "Last", stage: "backlog" });
        const user = await openMeeting("Weekly sync");
        await expectItems(["Send the deck"]);

        await user.click(checkbox("Send the deck"));
        await waitFor(() =>
            expect(backend.stageOf(backend.findTask("Send the deck"))).toBe(
                "done",
            ),
        );
        await goToWork(user);

        expect(await findCard("Done", "Send the deck")).toBeInTheDocument();
        expect(
            cardOrder("Backlog", ["First", "Send the deck", "Last"]),
        ).toEqual(["First", "Last"]);

        await reopenMeeting(user, "Weekly sync");
        await expectItems(["Send the deck"]);
        await user.click(checkbox("Send the deck"));
        await waitFor(() =>
            expect(backend.stageOf(backend.findTask("Send the deck"))).toBe(
                "backlog",
            ),
        );
        await goToWork(user);

        await findCard("Backlog", "Send the deck");
        expect(
            cardOrder("Backlog", ["First", "Send the deck", "Last"]),
        ).toEqual(["First", "Send the deck", "Last"]);
        expect(cardOrder("Done", ["Send the deck"])).toEqual([]);
    });

    it("is checked after the task is completed elsewhere, and unchecked after Reopen on the Work page", async () => {
        const sync = backend.seedMeeting("Weekly sync");
        const deck = backend.seedTask({
            title: "Send the deck",
            meeting: sync,
        });
        const user = await openMeeting("Weekly sync");
        await expectItems(["Send the deck"]);
        expect(checkbox("Send the deck")).not.toBeChecked();

        // The board completes a task by a drag, which jsdom cannot do, so the task is
        // completed directly in the backend.
        await backend.handle("set_task_completed", {
            id: deck.id,
            completed: true,
        });
        await reopenMeeting(user, "Weekly sync");
        await expectItems(["Send the deck"]);
        expect(checkbox("Send the deck")).toBeChecked();

        await goToWork(user);
        await findCard("Done", "Send the deck");
        await user.click(
            within(column("Done")).getByRole("button", {
                name: 'Reopen "Send the deck"',
            }),
        );
        await waitFor(() => expect(deck.completedAt).toBeNull());
        await findCard("Icebox", "Send the deck");

        await reopenMeeting(user, "Weekly sync");
        await expectItems(["Send the deck"]);
        expect(checkbox("Send the deck")).not.toBeChecked();
    });
});

describe("The Open button of an action item", () => {
    it("is between the text field and the remove button", async () => {
        const sync = backend.seedMeeting("Weekly sync");
        backend.seedTask({ title: "Send the deck", meeting: sync });
        await openMeeting("Weekly sync");
        await expectItems(["Send the deck"]);

        const open = openButton("Send the deck");
        expect(follows(itemField("Send the deck"), open)).toBe(true);
        expect(follows(open, removeButton("Send the deck"))).toBe(true);
    });

    it("opens the task sheet over the editor page, and the item shows a title saved in the sheet", async () => {
        const sync = backend.seedMeeting("Weekly sync", [], {
            project: checkout,
        });
        const deck = backend.seedTask({
            title: "Send the deck",
            meeting: sync,
        });
        const user = await openMeeting("Weekly sync");
        await expectItems(["Send the deck"]);

        const sheet = await openTaskSheet(user, "Send the deck");

        expect(titleField(sheet)).toHaveValue("Send the deck");
        expect(
            screen.getByRole("textbox", { name: "Meeting name", hidden: true }),
        ).toHaveValue("Weekly sync");

        await user.type(titleField(sheet), " today");
        expect(
            await within(sheet).findByText("Saved", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();
        expect(deck.title).toBe("Send the deck today");
        await waitFor(() =>
            expect(listedItems({ hidden: true })).toEqual([
                "Send the deck today",
            ]),
        );

        await user.keyboard("{Escape}");
        await waitFor(() =>
            expect(
                screen.queryByRole("textbox", {
                    name: "Task title",
                    hidden: true,
                }),
            ).not.toBeInTheDocument(),
        );
        await expectItems(["Send the deck today"]);
        expect(checkbox("Send the deck today")).toBeInTheDocument();
    });

    it("removes the item when the task is deleted in the sheet", async () => {
        const sync = backend.seedMeeting("Weekly sync");
        backend.seedTask({ title: "Send the deck", meeting: sync });
        backend.seedTask({ title: "Call Sam", meeting: sync });
        const user = await openMeeting("Weekly sync");
        await expectItems(["Send the deck", "Call Sam"]);
        const sheet = await openTaskSheet(user, "Send the deck");

        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        expect(
            await within(notifications()).findByText(
                'Deleted "Send the deck".',
            ),
        ).toBeInTheDocument();
        await expectItems(["Call Sam"]);
        expect(backend.findTask("Send the deck").deletedAt).not.toBeNull();
    });
});

describe("Removing an action item", () => {
    function seedThreeItems() {
        const sync = backend.seedMeeting("Weekly sync");
        backend.seedTask({ title: "Send the deck", meeting: sync });
        const room = backend.seedTask({ title: "Book a room", meeting: sync });
        backend.seedTask({ title: "Call Sam", meeting: sync });
        return { room };
    }

    it("deletes the task with a delete toast, and Undo puts the item back in its place", async () => {
        const { room } = seedThreeItems();
        const user = await openMeeting("Weekly sync");
        await expectItems(["Send the deck", "Book a room", "Call Sam"]);

        await user.click(removeButton("Book a room"));

        expect(
            await within(notifications()).findByText('Deleted "Book a room".'),
        ).toBeInTheDocument();
        await expectItems(["Send the deck", "Call Sam"]);
        expect(room.deletedAt).not.toBeNull();

        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        await expectItems(["Send the deck", "Book a room", "Call Sam"]);
        expect(room.deletedAt).toBeNull();
        expect(backend.stageOf(room)).toBe("icebox");
    });

    it("takes the card off the Work page", async () => {
        seedThreeItems();
        const user = await openMeeting("Weekly sync");
        await expectItems(["Send the deck", "Book a room", "Call Sam"]);

        await user.click(removeButton("Book a room"));
        await within(notifications()).findByText('Deleted "Book a room".');
        await goToWork(user);

        await findCard("Icebox", "Call Sam");
        expect(
            cardOrder("Icebox", ["Send the deck", "Book a room", "Call Sam"]),
        ).toEqual(["Call Sam", "Send the deck"]);
    });

    it("keeps the item and shows a failure toast when the task cannot be deleted", async () => {
        seedThreeItems();
        backend.failing.add("delete_task");
        const user = await openMeeting("Weekly sync");
        await expectItems(["Send the deck", "Book a room", "Call Sam"]);

        await user.click(removeButton("Book a room"));

        expect(
            await within(notifications()).findByText(
                "Couldn't remove the action item. Try again.",
            ),
        ).toBeInTheDocument();
        expect(listedItems()).toEqual([
            "Send the deck",
            "Book a room",
            "Call Sam",
        ]);
    });
});

describe("The list of action items", () => {
    it("does not show deleted tasks", async () => {
        const sync = backend.seedMeeting("Weekly sync");
        backend.seedTask({ title: "Send the deck", meeting: sync });
        backend.seedTask({ title: "Gone", meeting: sync, deleted: true });
        backend.seedTask({ title: "Call Sam", meeting: sync });
        await openMeeting("Weekly sync");

        await expectItems(["Send the deck", "Call Sam"]);
    });
});
