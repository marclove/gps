import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeBackend } from "@/test/fake-backend";

// Feature spec for the section, the board, adding a task in the Icebox, starting a task, and
// reopening a task in docs/specs/0010-work-section.md. The task sheet has its own spec, and
// scrolling and dragging are checked in a browser spec.
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

type ColumnName = "Current" | "Backlog" | "Icebox" | "Done";

const COLUMNS: ColumnName[] = ["Current", "Backlog", "Icebox", "Done"];

function mainNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

function workLink() {
    return within(mainNavigation()).getByRole("link", { name: "Work" });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

async function openWorkPage(): Promise<User> {
    const user = userEvent.setup();
    render(<App />);
    await user.click(workLink());
    await screen.findByRole("button", { name: "New task" });
    return user;
}

/**
 * Options for queries of the board. While the sheet is open, the board is behind a modal
 * dialog, which hides it from the accessibility tree, so such queries pass `hidden: true`.
 */
type BoardQuery = { hidden?: boolean };

function column(name: ColumnName, { hidden = false }: BoardQuery = {}) {
    return screen.getByRole("region", { name, hidden });
}

/** Tells if the button is the "Start" or the "Reopen" button of a card. */
function isStageButton(button: HTMLElement): boolean {
    const label = button.getAttribute("aria-label") ?? button.textContent ?? "";
    return /^(Start|Reopen)\b/.test(label.trim());
}

/** The buttons of the cards in the column that open the task sheet, from the top. */
function cards(name: ColumnName, { hidden = false }: BoardQuery = {}) {
    return within(column(name, { hidden }))
        .queryAllByRole("button", { hidden })
        .filter((button) => !isStageButton(button));
}

/** The shown title of each card in the column, from the top, without its project. */
function cardTitles(
    name: ColumnName,
    { hidden = false }: BoardQuery = {},
): string[] {
    return cards(name, { hidden }).map((card) => backend.cardText(card));
}

/** The card in the column whose accessible name starts with `title`. */
function card(name: ColumnName, title: string) {
    return within(column(name)).getByRole("button", {
        name: new RegExp(`^${title}`),
    });
}

function addTaskField() {
    return within(column("Icebox")).getByRole("textbox", { name: "Add task" });
}

function createCalls() {
    return invoke.mock.calls.filter(([command]) => command === "create_task");
}

describe("Work section", () => {
    it("has a link at the top with an icon and a tooltip, and the application still opens on Meetings", async () => {
        const user = userEvent.setup();
        render(<App />);

        const links = within(mainNavigation()).getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual([
            "Work",
            "Meetings",
            "Initiatives",
            "Projects",
        ]);
        expect(workLink().querySelector("svg")).toBeInTheDocument();
        expect(
            await screen.findByRole("button", { name: "New note" }),
        ).toBeInTheDocument();

        await user.hover(workLink());
        expect(await screen.findByRole("tooltip")).toHaveTextContent("Work");
    });

    it("opens the Work page, marks the link as current, and shows the breadcrumb and New task", async () => {
        await openWorkPage();

        expect(workLink()).toHaveAttribute("aria-current", "page");
        expect(
            within(
                screen.getByRole("navigation", { name: "breadcrumb" }),
            ).getByText("Work"),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "New task" }),
        ).toBeInTheDocument();
    });
});

describe("Board", () => {
    it("shows the four columns in order, with their names and counts", async () => {
        backend.seedTask({ title: "Write report", stage: "current" });
        backend.seedTask({ title: "Plan offsite", stage: "backlog" });
        backend.seedTask({ title: "Review budget", stage: "backlog" });
        backend.seedTask({ title: "Hire designer", stage: "backlog" });
        backend.seedTask({ title: "Idea", stage: "icebox" });
        await openWorkPage();

        await waitFor(() =>
            expect(cardTitles("Current")).toEqual(["Write report"]),
        );
        const regions = COLUMNS.map((name) => column(name));
        for (let i = 1; i < regions.length; i++) {
            expect(
                regions[i - 1].compareDocumentPosition(regions[i]) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        }
        const headings = COLUMNS.map(
            (name) => within(column(name)).getByRole("heading").textContent,
        );
        expect(headings[0]).toMatch(/^Current\s*1$/);
        expect(headings[1]).toMatch(/^Backlog\s*3$/);
        expect(headings[2]).toMatch(/^Icebox\s*1$/);
        expect(headings[3]).toMatch(/^Done\s*0$/);
    });

    it("orders Current and the Backlog by the list, the Icebox newest first, and Done by completion, newest first", async () => {
        backend.seedTask({ title: "Second", stage: "current", rank: "8" });
        backend.seedTask({ title: "First", stage: "current", rank: "4" });
        backend.seedTask({ title: "Fourth", stage: "backlog", rank: "c" });
        backend.seedTask({ title: "Third", stage: "backlog", rank: "a" });
        backend.seedTask({
            title: "New idea",
            createdAt: "2026-09-28T09:00:00.000Z",
        });
        backend.seedTask({
            title: "Old idea",
            createdAt: "2026-09-01T09:00:00.000Z",
        });
        backend.seedTask({
            title: "Finished last",
            stage: "done",
            completedAt: "2026-09-25T09:00:00.000Z",
        });
        backend.seedTask({
            title: "Finished first",
            stage: "done",
            completedAt: "2026-09-20T09:00:00.000Z",
        });
        await openWorkPage();

        await waitFor(() =>
            expect(cardTitles("Current")).toEqual(["First", "Second"]),
        );
        expect(cardTitles("Backlog")).toEqual(["Third", "Fourth"]);
        expect(cardTitles("Icebox")).toEqual(["New idea", "Old idea"]);
        expect(cardTitles("Done")).toEqual(["Finished last", "Finished first"]);
    });

    it("shows the tasks of deleted meetings, and does not show deleted tasks", async () => {
        const meeting = backend.seedMeeting("Old sync", [], { deleted: true });
        backend.seedTask({ title: "Follow up", meeting });
        backend.seedTask({ title: "Gone", deleted: true });
        backend.seedTask({
            title: "Gone too",
            stage: "backlog",
            deleted: true,
        });
        backend.seedTask({
            title: "Gone done",
            stage: "done",
            deleted: true,
        });
        await openWorkPage();

        await waitFor(() =>
            expect(cardTitles("Icebox")).toEqual(["Follow up"]),
        );
        expect(cardTitles("Backlog")).toEqual([]);
        expect(cardTitles("Done")).toEqual([]);
    });

    it("says No tasks in an empty column", async () => {
        backend.seedTask({ title: "Plan offsite", stage: "backlog" });
        await openWorkPage();

        await waitFor(() =>
            expect(cardTitles("Backlog")).toEqual(["Plan offsite"]),
        );
        expect(
            within(column("Backlog")).queryByText("No tasks"),
        ).not.toBeInTheDocument();
        for (const name of ["Current", "Icebox", "Done"] as const) {
            expect(
                within(column(name)).getByText("No tasks"),
            ).toBeInTheDocument();
        }
    });

    it("shows the shown title of each card, and the name of its project when it has one", async () => {
        const checkout = backend.seedProject("Checkout");
        const untitled = backend.seedProject("");
        backend.seedTask({
            title: "Fix payment",
            stage: "backlog",
            project: checkout,
        });
        backend.seedTask({ title: "", stage: "backlog", project: untitled });
        backend.seedTask({ title: "Read book", stage: "backlog" });
        await openWorkPage();

        await waitFor(() =>
            expect(cardTitles("Backlog")).toEqual([
                "Fix payment",
                "Untitled task",
                "Read book",
            ]),
        );
        expect(
            within(card("Backlog", "Fix payment")).getByText("Checkout"),
        ).toBeInTheDocument();
        expect(
            within(card("Backlog", "Untitled task")).getByText(
                "Untitled project",
            ),
        ).toBeInTheDocument();
        const plain = card("Backlog", "Read book").textContent;
        expect(plain).not.toContain("Checkout");
        expect(plain).not.toContain("Untitled project");
    });

    it("has a Start button on Backlog cards only, and a Reopen button on Done cards only", async () => {
        backend.seedTask({ title: "Now", stage: "current" });
        backend.seedTask({ title: "Next", stage: "backlog" });
        backend.seedTask({ title: "Someday", stage: "icebox" });
        backend.seedTask({ title: "Shipped", stage: "done" });
        await openWorkPage();

        await waitFor(() => expect(cardTitles("Backlog")).toEqual(["Next"]));
        expect(
            within(column("Backlog")).getByRole("button", {
                name: 'Start "Next"',
            }),
        ).toBeInTheDocument();
        expect(
            within(column("Done")).getByRole("button", {
                name: 'Reopen "Shipped"',
            }),
        ).toBeInTheDocument();
        for (const name of ["Current", "Icebox"] as const) {
            expect(
                within(column(name)).queryByRole("button", {
                    name: /^Start "/,
                }),
            ).not.toBeInTheDocument();
            expect(
                within(column(name)).queryByRole("button", {
                    name: /^Reopen "/,
                }),
            ).not.toBeInTheDocument();
        }
        expect(
            within(column("Backlog")).queryByRole("button", {
                name: /^Reopen "/,
            }),
        ).not.toBeInTheDocument();
        expect(
            within(column("Done")).queryByRole("button", { name: /^Start "/ }),
        ).not.toBeInTheDocument();
    });

    it("shows the headings of the columns and no cards while the tasks load", async () => {
        backend.seedTask({ title: "Plan offsite", stage: "backlog" });
        invoke.mockImplementation(
            (command: string, args?: Record<string, unknown>) =>
                command === "list_tasks"
                    ? new Promise(() => {})
                    : backend.handle(command, args),
        );
        await openWorkPage();

        for (const name of COLUMNS) {
            expect(
                within(column(name)).getByRole("heading").textContent,
            ).toMatch(new RegExp(`^${name}`));
            expect(cardTitles(name)).toEqual([]);
        }
    });

    it("says so when the tasks cannot be loaded, and loads them again on Retry", async () => {
        backend.seedTask({ title: "Plan offsite", stage: "backlog" });
        backend.failingOnce.add("list_tasks");
        const user = await openWorkPage();

        expect(
            await screen.findByText("Couldn't load tasks"),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("region", { name: "Backlog" }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() =>
            expect(cardTitles("Backlog")).toEqual(["Plan offsite"]),
        );
        expect(
            screen.queryByText("Couldn't load tasks"),
        ).not.toBeInTheDocument();
    });

    it("opens the task sheet when a card is clicked", async () => {
        backend.seedTask({ title: "Plan offsite", stage: "backlog" });
        const user = await openWorkPage();

        await user.click(
            await within(column("Backlog")).findByRole("button", {
                name: /^Plan offsite/,
            }),
        );

        expect(
            await screen.findByRole("dialog", { name: "Plan offsite" }),
        ).toBeInTheDocument();
    });

    it("opens the task sheet when Enter is pressed on a card", async () => {
        backend.seedTask({ title: "", stage: "icebox" });
        const user = await openWorkPage();
        const untitled = await within(column("Icebox")).findByRole("button", {
            name: /^Untitled task/,
        });

        untitled.focus();
        await user.keyboard("{Enter}");

        expect(
            await screen.findByRole("dialog", { name: "Untitled task" }),
        ).toBeInTheDocument();
        expect(cardTitles("Icebox", { hidden: true })).toEqual([
            "Untitled task",
        ]);
    });

    it("opens the task sheet for a draft when New task is clicked, and adds no card", async () => {
        backend.seedTask({ title: "Idea" });
        const user = await openWorkPage();
        await waitFor(() => expect(cardTitles("Icebox")).toEqual(["Idea"]));

        await user.click(screen.getByRole("button", { name: "New task" }));

        expect(
            await screen.findByRole("dialog", { name: "Untitled task" }),
        ).toBeInTheDocument();
        expect(cardTitles("Icebox", { hidden: true })).toEqual(["Idea"]);
        expect(backend.tasks).toHaveLength(1);
    });

    it("removes the card of a deleted task, and puts it back in its place on Undo", async () => {
        backend.seedTask({ title: "A", stage: "backlog" });
        backend.seedTask({ title: "B", stage: "backlog" });
        backend.seedTask({ title: "C", stage: "backlog" });
        const user = await openWorkPage();
        await user.click(
            await within(column("Backlog")).findByRole("button", {
                name: /^B/,
            }),
        );
        const sheet = await screen.findByRole("dialog", { name: "B" });

        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(
                screen.queryByRole("dialog", { name: "B" }),
            ).not.toBeInTheDocument(),
        );
        expect(cardTitles("Backlog")).toEqual(["A", "C"]);
        expect(screen.getByRole("button", { name: "New task" })).toHaveFocus();
        expect(
            within(notifications()).getByText('Deleted "B".'),
        ).toBeInTheDocument();

        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        await waitFor(() =>
            expect(cardTitles("Backlog")).toEqual(["A", "B", "C"]),
        );
        expect(backend.workColumn("backlog")).toEqual(["A", "B", "C"]);
    });
});

describe("Adding a task in the Icebox", () => {
    it("adds the text as a new task at the top of the Icebox, without spaces at its ends", async () => {
        backend.seedTask({ title: "Old idea" });
        const user = await openWorkPage();
        await waitFor(() => expect(cardTitles("Icebox")).toEqual(["Old idea"]));

        await user.type(addTaskField(), "  Write report  {Enter}");

        await waitFor(() =>
            expect(cardTitles("Icebox")).toEqual(["Write report", "Old idea"]),
        );
        expect(backend.workColumn("icebox")).toEqual([
            "Write report",
            "Old idea",
        ]);
        expect(backend.findTask("Write report")).toMatchObject({
            description: "",
            projectId: null,
            initiativeId: null,
            meetingId: null,
        });
    });

    it("empties the field and keeps the focus, so the next task can be typed at once", async () => {
        const user = await openWorkPage();

        await user.type(addTaskField(), "Write report{Enter}");

        await waitFor(() =>
            expect(cardTitles("Icebox")).toEqual(["Write report"]),
        );
        expect(addTaskField()).toHaveValue("");
        expect(addTaskField()).toHaveFocus();

        await user.keyboard("Plan offsite{Enter}");

        await waitFor(() =>
            expect(cardTitles("Icebox")).toEqual([
                "Plan offsite",
                "Write report",
            ]),
        );
    });

    it("does nothing when Enter is pressed in an empty field or a field with only spaces", async () => {
        const user = await openWorkPage();

        await user.type(addTaskField(), "{Enter}");
        await user.type(addTaskField(), "   {Enter}");

        expect(cardTitles("Icebox")).toEqual([]);
        expect(createCalls()).toHaveLength(0);
        expect(backend.tasks).toHaveLength(0);
    });

    it("puts the text back in the field and shows a failure toast when the task cannot be added", async () => {
        backend.failing.add("create_task");
        const user = await openWorkPage();

        await user.type(addTaskField(), "Write report{Enter}");

        expect(
            await within(notifications()).findByText(
                "Couldn't add the task. Try again.",
            ),
        ).toBeInTheDocument();
        expect(addTaskField()).toHaveValue("Write report");
        expect(cardTitles("Icebox")).toEqual([]);
        expect(backend.tasks).toHaveLength(0);
    });
});

describe("Starting a task", () => {
    it("moves the card to Current at its place in the list", async () => {
        backend.seedTask({ title: "A", stage: "current" });
        backend.seedTask({ title: "B", stage: "backlog" });
        backend.seedTask({ title: "C", stage: "current" });
        const user = await openWorkPage();
        await waitFor(() => expect(cardTitles("Current")).toEqual(["A", "C"]));

        await user.click(
            within(column("Backlog")).getByRole("button", {
                name: 'Start "B"',
            }),
        );

        await waitFor(() =>
            expect(cardTitles("Current")).toEqual(["A", "B", "C"]),
        );
        expect(cardTitles("Backlog")).toEqual([]);
        expect(backend.workColumn("current")).toEqual(["A", "B", "C"]);
    });

    it("puts the card back in the Backlog and shows a failure toast when the task cannot be started", async () => {
        backend.seedTask({ title: "A", stage: "current" });
        backend.seedTask({ title: "B", stage: "backlog" });
        backend.failing.add("start_task");
        const user = await openWorkPage();
        await waitFor(() => expect(cardTitles("Backlog")).toEqual(["B"]));

        await user.click(
            within(column("Backlog")).getByRole("button", {
                name: 'Start "B"',
            }),
        );

        expect(
            await within(notifications()).findByText(
                "Couldn't start the task. Try again.",
            ),
        ).toBeInTheDocument();
        await waitFor(() => expect(cardTitles("Backlog")).toEqual(["B"]));
        expect(cardTitles("Current")).toEqual(["A"]);
        expect(backend.stageOf(backend.findTask("B"))).toBe("backlog");
    });
});

describe("Reopening a task", () => {
    async function reopen(user: User, title: string) {
        await user.click(
            await within(column("Done")).findByRole("button", {
                name: `Reopen "${title}"`,
            }),
        );
    }

    const heldPlaces: {
        held: "current" | "backlog";
        name: ColumnName;
    }[] = [
        { held: "current", name: "Current" },
        { held: "backlog", name: "Backlog" },
    ];

    for (const { held, name } of heldPlaces) {
        it(`returns a task that was in ${name} to its held place there`, async () => {
            backend.seedTask({ title: "A", stage: held });
            backend.seedTask({ title: "X", stage: "done", heldStage: held });
            backend.seedTask({ title: "C", stage: held });
            const user = await openWorkPage();
            await waitFor(() => expect(cardTitles(name)).toEqual(["A", "C"]));

            await reopen(user, "X");

            await waitFor(() =>
                expect(cardTitles(name)).toEqual(["A", "X", "C"]),
            );
            expect(cardTitles("Done")).toEqual([]);
            expect(backend.workColumn(held)).toEqual(["A", "X", "C"]);
        });
    }

    it("returns a task that was not prioritized to the Icebox", async () => {
        backend.seedTask({ title: "Idea" });
        backend.seedTask({ title: "X", stage: "done", heldStage: "icebox" });
        const user = await openWorkPage();

        await reopen(user, "X");

        await waitFor(() => expect(cardTitles("Icebox")).toContain("X"));
        expect(cardTitles("Done")).toEqual([]);
        expect(cardTitles("Current")).toEqual([]);
        expect(cardTitles("Backlog")).toEqual([]);
        expect(backend.stageOf(backend.findTask("X"))).toBe("icebox");
    });

    it("puts the reopened card directly after a card that took its held place", async () => {
        backend.seedTask({ title: "A", stage: "current" });
        const x = backend.seedTask({
            title: "X",
            stage: "done",
            heldStage: "current",
        });
        backend.seedTask({ title: "C", stage: "current" });
        // Y was moved to the place of X after X was completed.
        backend.seedTask({ title: "Y", stage: "current", rank: x.rank });
        const user = await openWorkPage();
        await waitFor(() =>
            expect(cardTitles("Current")).toEqual(["A", "Y", "C"]),
        );

        await reopen(user, "X");

        await waitFor(() =>
            expect(cardTitles("Current")).toEqual(["A", "Y", "X", "C"]),
        );
        expect(backend.workColumn("current")).toEqual(["A", "Y", "X", "C"]);
    });

    it("keeps the card in Done and shows a failure toast when the task cannot be reopened", async () => {
        backend.seedTask({ title: "X", stage: "done", heldStage: "backlog" });
        backend.failing.add("set_task_completed");
        const user = await openWorkPage();

        await reopen(user, "X");

        expect(
            await within(notifications()).findByText(
                "Couldn't reopen the task. Try again.",
            ),
        ).toBeInTheDocument();
        expect(cardTitles("Done")).toEqual(["X"]);
        expect(cardTitles("Backlog")).toEqual([]);
        expect(backend.stageOf(backend.findTask("X"))).toBe("done");
    });
});
