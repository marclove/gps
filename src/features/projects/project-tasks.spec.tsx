import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import {
    FakeBackend,
    type StoredInitiative,
    type StoredProject,
} from "@/test/fake-backend";

// Feature spec for the tasks of a project, the tasks of an initiative, and deleting a project
// in docs/specs/0010-work-section.md.
// The Tauri backend is replaced by an in-memory fake of the backend commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeBackend;
let checkout: StoredProject;
let billing: StoredProject;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    checkout = backend.seedProject("Checkout");
    billing = backend.seedProject("Billing");
    invoke.mockImplementation(backend.handle);
});

type User = ReturnType<typeof userEvent.setup>;

/** Autosave waits for a pause, so a save can take longer than the default timeout. */
const SAVE_TIMEOUT = { timeout: 2000 };

function mainNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

function details(options: { hidden?: boolean } = {}) {
    return screen.getByRole("complementary", {
        name: "Project details",
        ...options,
    });
}

async function goToProject(user: User, name: string) {
    await user.click(
        within(mainNavigation()).getByRole("link", { name: "Projects" }),
    );
    await user.click(await screen.findByRole("link", { name }));
    const field = await screen.findByRole("textbox", { name: "Project name" });
    await waitFor(() => expect(field).toHaveValue(name));
}

/** Opens the page of the project from the Projects page, and waits until it has loaded. */
async function openProject(name: string): Promise<User> {
    const user = userEvent.setup();
    render(<App />);
    await goToProject(user, name);
    return user;
}

function tasksList(options: { hidden?: boolean } = {}) {
    return within(details(options)).getByRole("region", {
        name: "Tasks",
        ...options,
    });
}

/** The text of each row of a list of tasks, from the top. */
function rowsOf(list: HTMLElement, options: { hidden?: boolean } = {}) {
    return within(list)
        .queryAllByRole("button", options)
        .map((row) => row.textContent ?? "");
}

function taskRows(options: { hidden?: boolean } = {}): string[] {
    return rowsOf(tasksList(options), options);
}

/** Opens the task sheet from a row, and waits until the task has loaded. */
async function openTaskSheet(user: User, list: HTMLElement, title: string) {
    await user.click(
        await within(list).findByRole("button", { name: new RegExp(title) }),
    );
    const sheet = await screen.findByRole("dialog", { name: title });
    await waitFor(() => expect(titleField(sheet)).toBeEnabled());
    return sheet;
}

function titleField(sheet: HTMLElement) {
    return within(sheet).getByRole("textbox", { name: "Task title" });
}

/** Waits until no task sheet is open. A toast also has the role "dialog". */
async function waitForTaskSheetToClose() {
    await waitFor(() =>
        expect(
            screen.queryByRole("textbox", { name: "Task title", hidden: true }),
        ).not.toBeInTheDocument(),
    );
}

function follows(first: Element, second: Element) {
    return Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
}

/**
 * Seeds tasks in every stage for `fields`. The list of the project or the initiative must show
 * the rows `EXPECTED_ROWS`.
 */
function seedTasksInEveryStage(fields: {
    project?: StoredProject;
    initiative?: StoredInitiative;
}) {
    backend.seedTask({ ...fields, title: "B1", stage: "backlog" });
    backend.seedTask({ ...fields, title: "C1", stage: "current" });
    backend.seedTask({ ...fields, title: "I1" });
    backend.seedTask({ ...fields, title: "B2", stage: "backlog" });
    backend.seedTask({ ...fields, title: "C2", stage: "current" });
    backend.seedTask({ ...fields, title: "I2" });
    backend.seedTask({ ...fields, title: "Finished", stage: "done" });
    backend.seedTask({ ...fields, title: "Gone", deleted: true });
    backend.seedTask({ ...fields, title: "" });
}

const EXPECTED_ROWS = ["C1", "C2", "B1", "B2", "Untitled task", "I2", "I1"];

describe("The tasks of a project", () => {
    it("shows the list Tasks below the lists Initiatives and Meetings", async () => {
        await openProject("Checkout");

        const parts = [
            within(details()).getByRole("button", { name: "Delete" }),
            within(details()).getByRole("region", { name: "Initiatives" }),
            within(details()).getByRole("region", { name: "Meetings" }),
            tasksList(),
        ];
        for (let i = 1; i < parts.length; i++) {
            expect(follows(parts[i - 1], parts[i])).toBe(true);
        }
        expect(
            within(tasksList()).getByRole("heading", { name: "Tasks" }),
        ).toBeInTheDocument();
    });

    it("lists Current, then the Backlog, then the Icebox newest first, without completed or deleted tasks", async () => {
        seedTasksInEveryStage({ project: checkout });
        backend.seedTask({ title: "Other", project: billing });
        backend.seedTask({ title: "Loose" });
        await openProject("Checkout");

        await waitFor(() => expect(taskRows()).toEqual(EXPECTED_ROWS));
    });

    it("says No tasks when the project has none", async () => {
        backend.seedTask({ title: "Other", project: billing });
        backend.seedTask({ title: "Done", project: checkout, stage: "done" });
        await openProject("Checkout");

        expect(
            await within(tasksList()).findByText("No tasks"),
        ).toBeInTheDocument();
        expect(taskRows()).toEqual([]);
    });

    it("opens the task sheet over the project page, and shows a new title after a save", async () => {
        const deck = backend.seedTask({
            title: "Send the deck",
            project: checkout,
        });
        const user = await openProject("Checkout");

        const sheet = await openTaskSheet(user, tasksList(), "Send the deck");
        expect(
            screen.getByRole("textbox", { name: "Project name", hidden: true }),
        ).toHaveValue("Checkout");

        await user.type(titleField(sheet), " today");
        expect(
            await within(sheet).findByText("Saved", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();

        expect(deck.title).toBe("Send the deck today");
        await waitFor(() =>
            expect(taskRows({ hidden: true })).toEqual(["Send the deck today"]),
        );
    });

    it("removes a task that moves to another project from the list", async () => {
        const deck = backend.seedTask({
            title: "Send the deck",
            project: checkout,
        });
        const user = await openProject("Checkout");
        const sheet = await openTaskSheet(user, tasksList(), "Send the deck");

        await user.selectOptions(
            within(sheet).getByRole("combobox", { name: "Project" }),
            "Billing",
        );

        await waitFor(() => expect(deck.projectId).toBe(billing.id));
        await user.keyboard("{Escape}");
        await waitForTaskSheetToClose();
        await waitFor(() => expect(taskRows()).toEqual([]));
        expect(within(tasksList()).getByText("No tasks")).toBeInTheDocument();
    });

    it("removes a deleted task from the list, and Undo brings it back", async () => {
        backend.seedTask({ title: "First", project: checkout });
        const deck = backend.seedTask({
            title: "Send the deck",
            project: checkout,
        });
        const user = await openProject("Checkout");
        const sheet = await openTaskSheet(user, tasksList(), "Send the deck");

        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        await within(notifications()).findByText('Deleted "Send the deck".');
        await waitFor(() => expect(taskRows()).toEqual(["First"]));
        expect(deck.deletedAt).not.toBeNull();

        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        await waitFor(() =>
            expect(taskRows()).toEqual(["Send the deck", "First"]),
        );
    });
});

describe("The tasks of an initiative", () => {
    /** Opens the sheet of the initiative from the page of its project. */
    async function openInitiativeSheet(user: User, name: string) {
        await user.click(
            await within(
                within(details()).getByRole("region", { name: "Initiatives" }),
            ).findByRole("button", { name: new RegExp(`^${name}`) }),
        );
        const sheet = await screen.findByRole("dialog", { name });
        await waitFor(() =>
            expect(
                within(sheet).getByRole("textbox", { name: "Initiative name" }),
            ).toBeEnabled(),
        );
        return sheet;
    }

    it("shows the list Tasks between the description and the Delete and Save buttons", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
            horizon: "now",
        });
        seedTasksInEveryStage({ initiative: launch });
        backend.seedTask({ title: "Project only", project: checkout });
        const user = await openProject("Checkout");

        const sheet = await openInitiativeSheet(user, "Launch");

        const list = within(sheet).getByRole("region", { name: "Tasks" });
        const parts = [
            within(sheet).getByRole("textbox", { name: "Description" }),
            list,
            within(sheet).getByRole("button", { name: "Delete" }),
            within(sheet).getByRole("button", { name: "Save" }),
        ];
        for (let i = 1; i < parts.length; i++) {
            expect(follows(parts[i - 1], parts[i])).toBe(true);
        }
        await waitFor(() => expect(rowsOf(list)).toEqual(EXPECTED_ROWS));
    });

    it("says No tasks when the initiative has none", async () => {
        backend.seedInitiative({ name: "Launch", project: checkout });
        backend.seedTask({ title: "Project only", project: checkout });
        const user = await openProject("Checkout");

        const sheet = await openInitiativeSheet(user, "Launch");

        const list = within(sheet).getByRole("region", { name: "Tasks" });
        expect(await within(list).findByText("No tasks")).toBeInTheDocument();
        expect(rowsOf(list)).toEqual([]);
    });

    it("does not show the list in the sheet of a draft", async () => {
        const user = await openProject("Checkout");

        await user.click(
            within(details()).getByRole("button", { name: "New initiative" }),
        );
        const sheet = await screen.findByRole("dialog", {
            name: "Untitled initiative",
        });

        expect(
            within(sheet).getByRole("textbox", { name: "Initiative name" }),
        ).toBeInTheDocument();
        expect(
            within(sheet).queryByRole("region", { name: "Tasks" }),
        ).not.toBeInTheDocument();
    });

    it("closes the sheet of the initiative and opens the task sheet in its place", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        backend.seedTask({ title: "Send the deck", initiative: launch });
        const user = await openProject("Checkout");
        const sheet = await openInitiativeSheet(user, "Launch");
        const description = within(sheet).getByRole("textbox", {
            name: "Description",
        });
        await user.click(description);
        await user.keyboard("Ship it");

        await openTaskSheet(
            user,
            within(sheet).getByRole("region", { name: "Tasks" }),
            "Send the deck",
        );

        await waitFor(() =>
            expect(
                screen.queryByRole("textbox", {
                    name: "Initiative name",
                    hidden: true,
                }),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getAllByRole("textbox", { name: "Task title" }),
        ).toHaveLength(1);
        // The change that was not yet saved is saved when the sheet of the initiative closes.
        await waitFor(() => expect(launch.description).toContain("Ship it"));
    });

    it("moves the tasks of an initiative that moves to another project", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        backend.seedTask({ title: "Send the deck", initiative: launch });
        backend.seedTask({ title: "Project only", project: checkout });
        const user = userEvent.setup();
        render(<App />);
        await user.click(
            within(mainNavigation()).getByRole("link", { name: "Initiatives" }),
        );
        await user.click(
            await screen.findByRole("button", { name: /^Launch/ }),
        );
        const sheet = await screen.findByRole("dialog", { name: "Launch" });
        const select = within(sheet).getByRole("combobox", { name: "Project" });
        await waitFor(() => expect(select).toBeEnabled());

        await user.selectOptions(select, "Billing");
        await waitFor(() => expect(launch.projectId).toBe(billing.id));
        await user.keyboard("{Escape}");

        await goToProject(user, "Billing");
        await waitFor(() => expect(taskRows()).toEqual(["Send the deck"]));
        await goToProject(user, "Checkout");
        await waitFor(() => expect(taskRows()).toEqual(["Project only"]));
    });
});

describe("Deleting a project", () => {
    async function openProjectsPage(): Promise<User> {
        const user = userEvent.setup();
        render(<App />);
        await user.click(
            within(mainNavigation()).getByRole("link", { name: "Projects" }),
        );
        await screen.findByRole("heading", { name: "Projects" });
        return user;
    }

    it("refuses to delete a project that still has tasks, also completed ones", async () => {
        backend.seedTask({
            title: "Send the deck",
            project: checkout,
            stage: "done",
        });
        const user = await openProjectsPage();

        await user.click(
            await screen.findByRole("button", { name: 'Delete "Checkout"' }),
        );

        expect(
            await within(notifications()).findByText(
                'Couldn\'t delete "Checkout" because it still has tasks.',
            ),
        ).toBeInTheDocument();
        expect(checkout.deletedAt).toBeNull();
        expect(
            within(notifications()).queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument();
    });

    it("refuses on the project page too, and the page stays open", async () => {
        backend.seedTask({ title: "Send the deck", project: checkout });
        const user = await openProject("Checkout");

        await user.click(
            within(details()).getByRole("button", { name: "Delete" }),
        );

        expect(
            await within(notifications()).findByText(
                'Couldn\'t delete "Checkout" because it still has tasks.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("textbox", { name: "Project name" }),
        ).toHaveValue("Checkout");
    });

    it("gives the message about initiatives when the project has initiatives and tasks", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        backend.seedTask({ title: "Send the deck", initiative: launch });
        const user = await openProjectsPage();

        await user.click(
            await screen.findByRole("button", { name: 'Delete "Checkout"' }),
        );

        expect(
            await within(notifications()).findByText(
                'Couldn\'t delete "Checkout" because it still has initiatives.',
            ),
        ).toBeInTheDocument();
        expect(checkout.deletedAt).toBeNull();
    });

    it("allows the delete when every task of the project is deleted", async () => {
        backend.seedTask({
            title: "Send the deck",
            project: checkout,
            deleted: true,
        });
        const user = await openProjectsPage();

        await user.click(
            await screen.findByRole("button", { name: 'Delete "Checkout"' }),
        );

        await waitFor(() => expect(checkout.deletedAt).not.toBeNull());
    });
});
