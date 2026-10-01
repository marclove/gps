import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeBackend } from "@/test/fake-backend";

// Feature spec for creating a task in the sheet, the task sheet, saving a task, and deleting
// a task in docs/specs/0010-work-section.md. The board itself is checked in work.spec.tsx.
// The Tauri backend is replaced by an in-memory fake of the project, meeting, initiative, and
// task commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeBackend;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    invoke.mockImplementation(backend.handle);
});

type User = ReturnType<typeof userEvent.setup>;

/** Autosave waits for a pause, so a save can take longer than the default timeout. */
const SAVE_TIMEOUT = { timeout: 2000 };

type ColumnName = "Current" | "Backlog" | "Icebox" | "Done";

/**
 * Options for queries of the board. While the sheet is open, the board is behind a modal
 * dialog, which hides it from the accessibility tree, so such queries pass `hidden: true`.
 */
type BoardQuery = { hidden?: boolean };

function mainNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

async function openWorkPage(): Promise<User> {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
        within(mainNavigation()).getByRole("link", { name: "Work" }),
    );
    await screen.findByRole("button", { name: "New task" });
    return user;
}

function newTaskButton() {
    return screen.getByRole("button", { name: "New task" });
}

function column(name: ColumnName, { hidden = false }: BoardQuery = {}) {
    return screen.getByRole("region", { name, hidden });
}

/** The shown title of each card in the column, from the top, without its project. */
function cardTexts(
    name: ColumnName,
    { hidden = false }: BoardQuery = {},
): string[] {
    return within(column(name, { hidden }))
        .queryAllByRole("button", {
            hidden,
            name: (accessibleName) => !/^Reopen "/.test(accessibleName),
        })
        .map((card) => backend.cardText(card).trim());
}

function card(name: RegExp) {
    return screen.findByRole("button", { name });
}

function titleField(sheet: HTMLElement) {
    return within(sheet).getByRole("textbox", { name: "Task title" });
}

function projectSelect(sheet: HTMLElement) {
    return within(sheet).getByRole<HTMLSelectElement>("combobox", {
        name: "Project",
    });
}

function initiativeSelect(sheet: HTMLElement) {
    return within(sheet).getByRole<HTMLSelectElement>("combobox", {
        name: "Initiative",
    });
}

function description(sheet: HTMLElement) {
    return within(sheet).getByRole("textbox", { name: "Description" });
}

function optionTexts(select: HTMLSelectElement): string[] {
    return Array.from(select.options).map((option) => option.text);
}

function selectedText(select: HTMLSelectElement): string {
    return select.selectedOptions[0]?.text ?? "";
}

async function openSheet(user: User, cardName: RegExp, dialogName: string) {
    await user.click(await card(cardName));
    const sheet = await screen.findByRole("dialog", { name: dialogName });
    await waitFor(() => expect(titleField(sheet)).toBeEnabled());
    return sheet;
}

async function openDraft(user: User) {
    await user.click(newTaskButton());
    const sheet = await screen.findByRole("dialog", { name: "Untitled task" });
    await waitFor(() => expect(titleField(sheet)).toHaveFocus());
    return sheet;
}

/**
 * Waits until no sheet is open. A toast also has the role "dialog", so the sheet is
 * identified by its title field.
 */
async function waitForSheetToClose() {
    await waitFor(() =>
        expect(
            screen.queryByRole("textbox", { name: "Task title", hidden: true }),
        ).not.toBeInTheDocument(),
    );
}

function pause(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function follows(first: Element, second: Element) {
    return Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
}

function longDate(timestamp: string) {
    return new Date(timestamp).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

describe("Creating a task in the sheet", () => {
    it("opens an empty draft with focus in the title, no Delete button, and no save status", async () => {
        const user = await openWorkPage();

        const sheet = await openDraft(user);

        expect(titleField(sheet)).toHaveValue("");
        expect(selectedText(projectSelect(sheet))).toBe("No project");
        expect(selectedText(initiativeSelect(sheet))).toBe("No initiative");
        expect(description(sheet)).toHaveTextContent("");
        expect(
            within(sheet).queryByRole("button", { name: "Delete" }),
        ).not.toBeInTheDocument();
        expect(within(sheet).queryByText("Saved")).not.toBeInTheDocument();
        expect(within(sheet).queryByText("Saving…")).not.toBeInTheDocument();
        expect(backend.tasks).toHaveLength(0);
        expect(cardTexts("Icebox", { hidden: true })).toEqual([]);
    });

    it("saves the draft after a title is typed, at the top of the Icebox, and then shows the save status and Delete", async () => {
        backend.seedTask({ title: "Old" });
        const user = await openWorkPage();
        const sheet = await openDraft(user);

        await user.type(titleField(sheet), "  Fresh  ");

        await waitFor(
            () =>
                expect(backend.tasks.map((t) => t.title)).toEqual([
                    "Old",
                    "Fresh",
                ]),
            SAVE_TIMEOUT,
        );
        expect(backend.stageOf(backend.findTask("Fresh"))).toBe("icebox");
        expect(
            await within(sheet).findByText("Saved", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();
        expect(
            within(sheet).getByRole("button", { name: "Delete" }),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(cardTexts("Icebox", { hidden: true })).toEqual([
                "Fresh",
                "Old",
            ]),
        );
        expect(
            screen.getByRole("dialog", { name: "Fresh" }),
        ).toBeInTheDocument();
    });

    it("saves the draft at once when a project is chosen", async () => {
        const checkout = backend.seedProject("Checkout");
        const user = await openWorkPage();
        const sheet = await openDraft(user);
        await waitFor(() =>
            expect(optionTexts(projectSelect(sheet))).toContain("Checkout"),
        );

        await user.selectOptions(projectSelect(sheet), "Checkout");

        await waitFor(() =>
            expect(backend.tasks).toEqual([
                expect.objectContaining({
                    title: "",
                    projectId: checkout.id,
                    initiativeId: null,
                }),
            ]),
        );
        await waitFor(() =>
            expect(cardTexts("Icebox", { hidden: true })).toEqual([
                "Untitled task",
            ]),
        );
        const saved = within(column("Icebox", { hidden: true })).getByRole(
            "button",
            { name: /^Untitled task/, hidden: true },
        );
        expect(within(saved).getByText("Checkout")).toBeInTheDocument();
    });

    it("saves the draft when text is typed in the description", async () => {
        const user = await openWorkPage();
        const sheet = await openDraft(user);

        await user.click(description(sheet));
        await user.keyboard("Call the bank");

        await waitFor(
            () =>
                expect(backend.tasks).toEqual([
                    expect.objectContaining({
                        title: "",
                        description: "Call the bank",
                    }),
                ]),
            SAVE_TIMEOUT,
        );
    });

    it("saves a typed title at once when the draft closes", async () => {
        const user = await openWorkPage();
        const sheet = await openDraft(user);

        await user.type(titleField(sheet), "Fresh");
        await user.keyboard("{Escape}");

        await waitForSheetToClose();
        await waitFor(() => expect(cardTexts("Icebox")).toEqual(["Fresh"]));
        expect(backend.findTask("Fresh")).toBeDefined();
    });

    it("saves nothing when a draft with only spaces in its title closes", async () => {
        const user = await openWorkPage();
        const sheet = await openDraft(user);

        await user.type(titleField(sheet), "   ");
        await pause(800);
        expect(backend.tasks).toHaveLength(0);
        await user.keyboard("{Escape}");

        await waitForSheetToClose();
        await pause(100);
        expect(backend.tasks).toHaveLength(0);
        expect(cardTexts("Icebox")).toEqual([]);
    });

    it("saves nothing when an unchanged draft closes, and gives focus back to New task", async () => {
        const user = await openWorkPage();
        const sheet = await openDraft(user);

        await user.click(within(sheet).getByRole("button", { name: "Close" }));

        await waitForSheetToClose();
        expect(newTaskButton()).toHaveFocus();
        expect(backend.tasks).toHaveLength(0);
        expect(invoke).not.toHaveBeenCalledWith(
            "create_task",
            expect.anything(),
        );
    });
});

describe("The task sheet", () => {
    it("shows the title, project, initiative, meeting, completion, toolbar, description, Delete, and Save, in that order, and Close last", async () => {
        const checkout = backend.seedProject("Checkout");
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        const kickoff = backend.seedMeeting("Kickoff", [launch.id]);
        const task = backend.seedTask({
            title: "Send the notes",
            meeting: kickoff,
            description: "Ship **v2**",
            stage: "done",
        });
        const user = await openWorkPage();

        const sheet = await openSheet(
            user,
            /^Send the notes/,
            "Send the notes",
        );

        const completed = within(sheet).getByText(
            `Completed on ${longDate(task.completedAt!)}`,
        );
        const parts = [
            titleField(sheet),
            projectSelect(sheet),
            initiativeSelect(sheet),
            within(sheet).getByText("Meeting"),
            within(sheet).getByRole("link", { name: "Kickoff" }),
            completed,
            within(sheet).getByRole("toolbar", { name: "Formatting" }),
            description(sheet),
            within(sheet).getByRole("button", { name: "Delete" }),
            within(sheet).getByRole("button", { name: "Save" }),
            within(sheet).getByRole("button", { name: "Close" }),
        ];
        for (let i = 1; i < parts.length; i++) {
            expect(follows(parts[i - 1], parts[i])).toBe(true);
        }
        expect(titleField(sheet)).toHaveValue("Send the notes");
        expect(selectedText(projectSelect(sheet))).toBe("Checkout");
        expect(selectedText(initiativeSelect(sheet))).toBe("Launch");
        expect(within(description(sheet)).getByText("v2").tagName).toBe(
            "STRONG",
        );
    });

    it("shows no meeting and no completion for a task that is not from a meeting and not completed", async () => {
        backend.seedTask({ title: "Plan", stage: "backlog" });
        const user = await openWorkPage();

        const sheet = await openSheet(user, /^Plan/, "Plan");

        expect(within(sheet).queryByText("Meeting")).not.toBeInTheDocument();
        expect(within(sheet).queryByRole("link")).not.toBeInTheDocument();
        expect(
            within(sheet).queryByText(/^Completed on/),
        ).not.toBeInTheDocument();
    });

    it("is named Untitled task and shows it as a placeholder when the title is empty", async () => {
        backend.seedTask({ title: "" });
        const user = await openWorkPage();

        const sheet = await openSheet(user, /^Untitled task/, "Untitled task");

        expect(titleField(sheet)).toHaveValue("");
        expect(titleField(sheet)).toHaveAttribute(
            "placeholder",
            "Untitled task",
        );
    });

    it("closes and opens the editor page of the meeting when the meeting link is clicked", async () => {
        const kickoff = backend.seedMeeting("Kickoff");
        backend.seedTask({ title: "Send the notes", meeting: kickoff });
        const user = await openWorkPage();
        const sheet = await openSheet(
            user,
            /^Send the notes/,
            "Send the notes",
        );

        await user.click(within(sheet).getByRole("link", { name: "Kickoff" }));

        await waitForSheetToClose();
        expect(
            await screen.findByRole("textbox", { name: "Meeting name" }),
        ).toHaveValue("Kickoff");
    });

    it("shows a deleted meeting as plain text with (deleted) after its name", async () => {
        const kickoff = backend.seedMeeting("Kickoff", [], { deleted: true });
        backend.seedTask({ title: "Send the notes", meeting: kickoff });
        const user = await openWorkPage();

        const sheet = await openSheet(
            user,
            /^Send the notes/,
            "Send the notes",
        );

        expect(
            within(sheet).getByText("Kickoff (deleted)"),
        ).toBeInTheDocument();
        expect(within(sheet).queryByRole("link")).not.toBeInTheDocument();
    });

    it("offers No project and the projects that are not deleted, by name without regard to case", async () => {
        backend.seedProject("checkout");
        backend.seedProject("Billing");
        backend.seedProject("");
        backend.seedProject("Old", { deleted: true });
        backend.seedTask({ title: "Plan" });
        const user = await openWorkPage();

        const sheet = await openSheet(user, /^Plan/, "Plan");

        expect(optionTexts(projectSelect(sheet))).toEqual([
            "No project",
            "Billing",
            "checkout",
            "Untitled project",
        ]);
        expect(selectedText(projectSelect(sheet))).toBe("No project");
    });

    it("disables the Initiative select box when the task has no project", async () => {
        backend.seedInitiative({ name: "Launch" });
        backend.seedTask({ title: "Plan", project: null });
        const user = await openWorkPage();

        const sheet = await openSheet(user, /^Plan/, "Plan");

        expect(initiativeSelect(sheet)).toBeDisabled();
        expect(selectedText(initiativeSelect(sheet))).toBe("No initiative");
    });

    it("offers No initiative and the initiatives of the project that are not deleted, also completed ones, by name", async () => {
        const checkout = backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        backend.seedInitiative({ name: "pilot", project: checkout });
        backend.seedInitiative({
            name: "Launch",
            project: checkout,
            completed: true,
        });
        backend.seedInitiative({
            name: "Gone",
            project: checkout,
            deleted: true,
        });
        backend.seedInitiative({ name: "Invoices", project: billing });
        backend.seedTask({ title: "Plan", project: checkout });
        const user = await openWorkPage();

        const sheet = await openSheet(user, /^Plan/, "Plan");

        expect(initiativeSelect(sheet)).toBeEnabled();
        expect(optionTexts(initiativeSelect(sheet))).toEqual([
            "No initiative",
            "Launch",
            "pilot",
        ]);
        expect(selectedText(initiativeSelect(sheet))).toBe("No initiative");
    });

    it("shows a deleted project and a deleted initiative of the task with (deleted), selected", async () => {
        const old = backend.seedProject("Old");
        const legacy = backend.seedInitiative({ name: "Legacy", project: old });
        backend.seedTask({ title: "Plan", project: old, initiative: legacy });
        legacy.deletedAt = "2026-09-25T10:00:00.000Z";
        old.deletedAt = "2026-09-25T10:00:01.000Z";
        backend.seedProject("Billing");
        const user = await openWorkPage();

        const sheet = await openSheet(user, /^Plan/, "Plan");

        expect(optionTexts(projectSelect(sheet))).toContain("Old (deleted)");
        expect(optionTexts(projectSelect(sheet))).toContain("Billing");
        expect(selectedText(projectSelect(sheet))).toBe("Old (deleted)");
        expect(optionTexts(initiativeSelect(sheet))).toContain(
            "Legacy (deleted)",
        );
        expect(selectedText(initiativeSelect(sheet))).toBe("Legacy (deleted)");
    });

    it("disables the fields while the task loads", async () => {
        backend.seedTask({ title: "Plan" });
        let release!: () => void;
        const loaded = new Promise<void>((resolve) => {
            release = resolve;
        });
        invoke.mockImplementation(
            async (command: string, args?: Record<string, unknown>) => {
                if (command === "get_task") await loaded;
                return backend.handle(command, args);
            },
        );
        const user = await openWorkPage();

        await user.click(await card(/^Plan/));
        const sheet = await screen.findByRole("dialog", { name: "Plan" });

        expect(titleField(sheet)).toBeDisabled();
        expect(projectSelect(sheet)).toBeDisabled();
        expect(initiativeSelect(sheet)).toBeDisabled();
        release();
        await waitFor(() => expect(titleField(sheet)).toBeEnabled());
        expect(projectSelect(sheet)).toBeEnabled();
    });

    it("says so when the task cannot be loaded, and loads it again on Retry", async () => {
        backend.seedTask({ title: "Plan" });
        backend.failingOnce.add("get_task");
        const user = await openWorkPage();

        await user.click(await card(/^Plan/));
        const sheet = await screen.findByRole("dialog", { name: "Plan" });
        expect(
            await within(sheet).findByText("Couldn't load the task"),
        ).toBeInTheDocument();
        await user.click(within(sheet).getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(titleField(sheet)).toHaveValue("Plan"));
        expect(titleField(sheet)).toBeEnabled();
    });

    it("closes with the Close button and with Escape, and gives focus back to the card", async () => {
        backend.seedTask({ title: "Plan", stage: "backlog" });
        const user = await openWorkPage();

        const sheet = await openSheet(user, /^Plan/, "Plan");
        await user.click(within(sheet).getByRole("button", { name: "Close" }));
        await waitForSheetToClose();
        expect(await card(/^Plan/)).toHaveFocus();

        await openSheet(user, /^Plan/, "Plan");
        await user.keyboard("{Escape}");
        await waitForSheetToClose();
        expect(await card(/^Plan/)).toHaveFocus();
    });
});

describe("Saving a task", () => {
    it("saves the title without its outer spaces and updates the card in place and the name of the sheet", async () => {
        backend.seedTask({ title: "First", stage: "backlog" });
        backend.seedTask({ title: "Plan", stage: "backlog" });
        backend.seedTask({ title: "Last", stage: "backlog" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.clear(titleField(sheet));
        await user.type(titleField(sheet), "  Plan the launch  ");

        await waitFor(
            () =>
                expect(backend.listOrder()).toEqual([
                    "First",
                    "Plan the launch",
                    "Last",
                ]),
            SAVE_TIMEOUT,
        );
        expect(
            await within(sheet).findByText("Saved", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(cardTexts("Backlog", { hidden: true })).toEqual([
                "First",
                "Plan the launch",
                "Last",
            ]),
        );
        expect(
            screen.getByRole("dialog", { name: "Plan the launch" }),
        ).toBeInTheDocument();
    });

    it("saves the description automatically", async () => {
        backend.seedTask({ title: "Plan" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.click(description(sheet));
        await user.keyboard("Goals");

        await waitFor(
            () =>
                expect(backend.findTask("Plan").description).toContain("Goals"),
            SAVE_TIMEOUT,
        );
        expect(
            await within(sheet).findByText("Saved", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();
    });

    it("shows Couldn't save when a save fails, and saves on Retry", async () => {
        backend.seedTask({ title: "Plan" });
        backend.failingOnce.add("update_task_title");
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.type(titleField(sheet), "!");

        expect(
            await within(sheet).findByText("Couldn't save", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();
        await user.click(within(sheet).getByRole("button", { name: "Retry" }));
        expect(
            await within(sheet).findByText("Saved", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();
        expect(backend.findTask("Plan!")).toBeDefined();
    });

    it("saves a pending change when the sheet closes, and shows it when the sheet opens again", async () => {
        backend.seedTask({ title: "Plan" });
        const user = await openWorkPage();
        let sheet = await openSheet(user, /^Plan/, "Plan");

        await user.type(titleField(sheet), "!");
        await user.keyboard("{Escape}");

        await waitForSheetToClose();
        await waitFor(() => expect(cardTexts("Icebox")).toEqual(["Plan!"]));
        expect(await card(/^Plan!/)).toHaveFocus();
        sheet = await openSheet(user, /^Plan!/, "Plan!");
        expect(titleField(sheet)).toHaveValue("Plan!");
    });

    it("saves a pending change at once when Save is clicked, closes the sheet, and gives focus back to the card", async () => {
        backend.seedTask({ title: "Plan", stage: "current" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.type(titleField(sheet), "!");
        await user.click(within(sheet).getByRole("button", { name: "Save" }));

        await waitForSheetToClose();
        await waitFor(() => expect(cardTexts("Current")).toEqual(["Plan!"]));
        expect(backend.findTask("Plan!")).toBeDefined();
        expect(await card(/^Plan!/)).toHaveFocus();
    });

    it("saves a chosen project at once, shows it on the card, and keeps it when the sheet opens again", async () => {
        backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        backend.seedTask({ title: "Plan" });
        const user = await openWorkPage();
        let sheet = await openSheet(user, /^Plan/, "Plan");

        await user.selectOptions(projectSelect(sheet), "Billing");

        await waitFor(() =>
            expect(backend.findTask("Plan").projectId).toBe(billing.id),
        );
        expect(initiativeSelect(sheet)).toBeEnabled();
        const planCard = within(column("Icebox", { hidden: true })).getByRole(
            "button",
            { name: /^Plan/, hidden: true },
        );
        await waitFor(() =>
            expect(within(planCard).getByText("Billing")).toBeInTheDocument(),
        );

        await user.keyboard("{Escape}");
        await waitForSheetToClose();
        sheet = await openSheet(user, /^Plan/, "Plan");
        expect(selectedText(projectSelect(sheet))).toBe("Billing");
    });

    it("saves a chosen initiative at once and keeps the project of that initiative", async () => {
        const checkout = backend.seedProject("Checkout");
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        backend.seedTask({ title: "Plan", project: checkout });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.selectOptions(initiativeSelect(sheet), "Launch");

        await waitFor(() =>
            expect(backend.findTask("Plan")).toMatchObject({
                projectId: checkout.id,
                initiativeId: launch.id,
            }),
        );
        expect(invoke).toHaveBeenCalledWith(
            "set_task_initiative",
            expect.objectContaining({ initiativeId: launch.id }),
        );
        expect(selectedText(projectSelect(sheet))).toBe("Checkout");
        expect(selectedText(initiativeSelect(sheet))).toBe("Launch");
    });

    it("clears the initiative when another project is chosen", async () => {
        const checkout = backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        backend.seedInitiative({ name: "Invoices", project: billing });
        backend.seedTask({ title: "Plan", initiative: launch });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");
        expect(selectedText(initiativeSelect(sheet))).toBe("Launch");

        await user.selectOptions(projectSelect(sheet), "Billing");

        await waitFor(() =>
            expect(backend.findTask("Plan")).toMatchObject({
                projectId: billing.id,
                initiativeId: null,
            }),
        );
        await waitFor(() =>
            expect(selectedText(initiativeSelect(sheet))).toBe("No initiative"),
        );
        expect(optionTexts(initiativeSelect(sheet))).toEqual([
            "No initiative",
            "Invoices",
        ]);
    });

    it("clears the project and the initiative when No project is chosen", async () => {
        const checkout = backend.seedProject("Checkout");
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        backend.seedTask({ title: "Plan", initiative: launch });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.selectOptions(projectSelect(sheet), "No project");

        await waitFor(() =>
            expect(backend.findTask("Plan")).toMatchObject({
                projectId: null,
                initiativeId: null,
            }),
        );
        await waitFor(() => expect(initiativeSelect(sheet)).toBeDisabled());
        expect(selectedText(initiativeSelect(sheet))).toBe("No initiative");
        const planCard = within(column("Icebox", { hidden: true })).getByRole(
            "button",
            { name: /^Plan/, hidden: true },
        );
        await waitFor(() =>
            expect(
                within(planCard).queryByText("Checkout"),
            ).not.toBeInTheDocument(),
        );
    });

    it("goes back to the saved project and shows a failure toast when the project cannot be saved", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedProject("Billing");
        backend.seedTask({ title: "Plan", project: checkout });
        backend.failing.add("set_task_project");
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.selectOptions(projectSelect(sheet), "Billing");

        expect(
            await within(notifications()).findByText(
                "Couldn't change the project. Try again.",
            ),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(selectedText(projectSelect(sheet))).toBe("Checkout"),
        );
        expect(backend.findTask("Plan").projectId).toBe(checkout.id);
    });

    it("goes back to the saved initiative and shows a failure toast when the initiative cannot be saved", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedInitiative({ name: "Launch", project: checkout });
        backend.seedTask({ title: "Plan", project: checkout });
        backend.failing.add("set_task_initiative");
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.selectOptions(initiativeSelect(sheet), "Launch");

        expect(
            await within(notifications()).findByText(
                "Couldn't change the initiative. Try again.",
            ),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(selectedText(initiativeSelect(sheet))).toBe("No initiative"),
        );
        expect(backend.findTask("Plan").initiativeId).toBeNull();
    });
});

describe("Deleting a task", () => {
    it("closes the sheet, removes the card, focuses New task, and shows the delete toast", async () => {
        backend.seedTask({ title: "A", stage: "backlog" });
        backend.seedTask({ title: "Plan", stage: "backlog" });
        backend.seedTask({ title: "C", stage: "backlog" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        await waitForSheetToClose();
        await waitFor(() => expect(cardTexts("Backlog")).toEqual(["A", "C"]));
        expect(newTaskButton()).toHaveFocus();
        const toast = within(notifications());
        expect(toast.getByText('Deleted "Plan".')).toBeInTheDocument();
        expect(toast.getByRole("button", { name: "Undo" })).toBeInTheDocument();
        expect(
            toast.getByRole("button", { name: "Close" }),
        ).toBeInTheDocument();
        expect(backend.findTask("Plan").deletedAt).not.toBeNull();
    });

    it("names a task with an empty title Untitled task in the delete toast", async () => {
        backend.seedTask({ title: "" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Untitled task/, "Untitled task");

        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        expect(
            await within(notifications()).findByText(
                'Deleted "Untitled task".',
            ),
        ).toBeInTheDocument();
    });

    it("saves a pending change before deleting, and names the task by its latest title", async () => {
        backend.seedTask({ title: "Plan" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.type(titleField(sheet), " v2");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        expect(
            await within(notifications()).findByText('Deleted "Plan v2".'),
        ).toBeInTheDocument();
        expect(backend.findTask("Plan v2").deletedAt).not.toBeNull();
    });

    it("restores the task to its held place in the Backlog on Undo", async () => {
        backend.seedTask({ title: "A", stage: "backlog" });
        backend.seedTask({ title: "Plan", stage: "backlog" });
        backend.seedTask({ title: "C", stage: "backlog" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(cardTexts("Backlog")).toEqual(["A", "C"]));

        await user.click(
            await within(notifications()).findByRole("button", {
                name: "Undo",
            }),
        );

        await waitFor(() =>
            expect(cardTexts("Backlog")).toEqual(["A", "Plan", "C"]),
        );
        expect(backend.workColumn("backlog")).toEqual(["A", "Plan", "C"]);
    });

    it("restores a started task to Current on Undo", async () => {
        backend.seedTask({ title: "A", stage: "current" });
        backend.seedTask({ title: "Plan", stage: "current" });
        backend.seedTask({ title: "C", stage: "backlog" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(cardTexts("Current")).toEqual(["A"]));

        await user.click(
            await within(notifications()).findByRole("button", {
                name: "Undo",
            }),
        );

        await waitFor(() =>
            expect(cardTexts("Current")).toEqual(["A", "Plan"]),
        );
        expect(cardTexts("Backlog")).toEqual(["C"]);
    });

    it("restores the task directly after a card that took its held place", async () => {
        backend.seedTask({ title: "A", stage: "backlog", rank: "4" });
        backend.seedTask({ title: "Plan", stage: "backlog", rank: "8" });
        backend.seedTask({ title: "C", stage: "backlog", rank: "c" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(cardTexts("Backlog")).toEqual(["A", "C"]));
        // As if the user had dropped C into the place of Plan, and the backend had given C
        // the rank that Plan still keeps.
        backend.findTask("C").rank = "8";

        await user.click(
            await within(notifications()).findByRole("button", {
                name: "Undo",
            }),
        );

        await waitFor(() =>
            expect(cardTexts("Backlog")).toEqual(["A", "C", "Plan"]),
        );
        expect(backend.workColumn("backlog")).toEqual(["A", "C", "Plan"]);
    });

    it("restores a completed task to Done on Undo", async () => {
        backend.seedTask({ title: "Plan", stage: "done" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(cardTexts("Done")).toEqual([]));

        await user.click(
            await within(notifications()).findByRole("button", {
                name: "Undo",
            }),
        );

        await waitFor(() => expect(cardTexts("Done")).toEqual(["Plan"]));
        expect(backend.stageOf(backend.findTask("Plan"))).toBe("done");
    });

    it("keeps the task and shows a failure toast when the delete fails", async () => {
        backend.seedTask({ title: "Plan" });
        backend.failing.add("delete_task");
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");

        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        expect(
            await within(notifications()).findByText(
                "Couldn't delete the task. Try again.",
            ),
        ).toBeInTheDocument();
        expect(cardTexts("Icebox", { hidden: true })).toEqual(["Plan"]);
        expect(backend.findTask("Plan").deletedAt).toBeNull();
    });

    it("says so in the toast when the restore fails, keeps Undo, and tries again on Undo", async () => {
        backend.seedTask({ title: "Plan", stage: "backlog" });
        const user = await openWorkPage();
        const sheet = await openSheet(user, /^Plan/, "Plan");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));
        backend.failingOnce.add("restore_task");

        await user.click(
            await within(notifications()).findByRole("button", {
                name: "Undo",
            }),
        );
        expect(
            await within(notifications()).findByText(
                "Couldn't restore the task. Try again.",
            ),
        ).toBeInTheDocument();
        expect(backend.findTask("Plan").deletedAt).not.toBeNull();
        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        await waitFor(() => expect(cardTexts("Backlog")).toEqual(["Plan"]));
        expect(backend.findTask("Plan").deletedAt).toBeNull();
    });
});
