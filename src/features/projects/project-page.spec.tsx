import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import {
    FakeRoadmapBackend,
    type StoredProject,
} from "@/test/fake-roadmap-backend";

// Feature spec for the project page and the initiatives and meetings of a project in
// docs/specs/0008-projects.md.
// The Tauri backend is replaced by an in-memory fake of the project, meeting, and initiative
// commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeRoadmapBackend;
let checkout: StoredProject;
let billing: StoredProject;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeRoadmapBackend();
    checkout = backend.seedProject("Checkout", {
        description: "Payments and **refunds**",
    });
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

/** Opens the page of the project from the Projects page, and waits until it has loaded. */
async function openProject(name: string): Promise<User> {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
        within(mainNavigation()).getByRole("link", { name: "Projects" }),
    );
    await user.click(await screen.findByRole("link", { name }));
    const field = await screen.findByRole("textbox", { name: "Project name" });
    await waitFor(() => expect(field).toHaveValue(name));
    return user;
}

/** The list of initiatives in the sidebar. */
function initiativesList(options: { hidden?: boolean } = {}) {
    return within(details(options)).getByRole("region", {
        name: "Initiatives",
        ...options,
    });
}

/** The list of meetings in the sidebar. */
function meetingsList() {
    return within(details()).getByRole("region", { name: "Meetings" });
}

/** The text of each row of the list of initiatives, from the top. */
function initiativeRows(options: { hidden?: boolean } = {}): string[] {
    return within(initiativesList(options))
        .queryAllByRole("listitem", options)
        .map((row) => row.textContent ?? "");
}

/** The text of each row of the list of meetings, from the top. */
function meetingRows(): string[] {
    return within(meetingsList())
        .queryAllByRole("listitem")
        .map((row) => row.textContent ?? "");
}

function follows(first: Element, second: Element) {
    return Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
}

describe("The project page", () => {
    it("shows the breadcrumb, the name, the description, and the sidebar in order", async () => {
        await openProject("Checkout");

        const breadcrumb = screen.getByRole("navigation", {
            name: "breadcrumb",
        });
        expect(
            within(breadcrumb).getByRole("link", { name: "Projects" }),
        ).toBeInTheDocument();
        expect(within(breadcrumb).getByText("Checkout")).toBeInTheDocument();
        const description = screen.getByRole("textbox", {
            name: "Description",
        });
        expect(within(description).getByText("refunds").tagName).toBe("STRONG");
        expect(
            screen.getByRole("toolbar", { name: "Formatting" }),
        ).toBeInTheDocument();

        const parts = [
            within(details()).getByRole("button", { name: "Delete" }),
            initiativesList(),
            within(initiativesList()).getByRole("button", {
                name: "New initiative",
            }),
            meetingsList(),
        ];
        for (let i = 1; i < parts.length; i++) {
            expect(follows(parts[i - 1], parts[i])).toBe(true);
        }
    });

    it("saves the name and the description automatically, and shows the save status", async () => {
        const user = await openProject("Checkout");
        const name = screen.getByRole("textbox", { name: "Project name" });

        await user.type(name, " v2");
        await user.click(screen.getByRole("textbox", { name: "Description" }));
        await user.keyboard(" More");

        expect(
            await screen.findByText("Saved", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(checkout).toMatchObject({ name: "Checkout v2" }),
        );
        expect(checkout.description).toContain("More");
        expect(
            within(
                screen.getByRole("navigation", { name: "breadcrumb" }),
            ).getByText("Checkout v2"),
        ).toBeInTheDocument();
    });

    it("shows Couldn't save with Retry when a change cannot be saved", async () => {
        backend.failingOnce.add("rename_project");
        const user = await openProject("Checkout");

        await user.type(
            screen.getByRole("textbox", { name: "Project name" }),
            "!",
        );

        expect(
            await screen.findByText("Couldn't save", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(checkout.name).toBe("Checkout!"));
    });
});

describe("The initiatives of a project", () => {
    it("lists the initiatives of the project that are not deleted, in roadmap order", async () => {
        backend.seedInitiative({
            name: "Old win",
            project: checkout,
            completed: true,
        });
        backend.seedInitiative({ name: "Later one", project: checkout });
        backend.seedInitiative({
            name: "New win",
            project: checkout,
            completed: true,
        });
        backend.seedInitiative({
            name: "Next one",
            project: checkout,
            horizon: "next",
        });
        backend.seedInitiative({
            name: "",
            project: checkout,
            horizon: "now",
        });
        backend.seedInitiative({
            name: "Gone",
            project: checkout,
            deleted: true,
        });
        backend.seedInitiative({
            name: "Other",
            project: billing,
            horizon: "now",
        });
        await openProject("Checkout");

        await waitFor(() =>
            expect(initiativeRows()).toEqual([
                "Untitled initiative",
                "Next one",
                "Later one",
                "New win",
                "Old win",
            ]),
        );
    });

    it("says No initiatives when the project has none", async () => {
        backend.seedInitiative({ name: "Other", project: billing });
        await openProject("Checkout");

        expect(
            await within(initiativesList()).findByText("No initiatives"),
        ).toBeInTheDocument();
    });

    it("opens the sheet of an initiative over the project page, and shows a new name after a save", async () => {
        backend.seedInitiative({
            name: "Launch",
            project: checkout,
            horizon: "now",
        });
        const user = await openProject("Checkout");

        await user.click(
            await within(initiativesList()).findByRole("button", {
                name: /^Launch/,
            }),
        );
        const sheet = await screen.findByRole("dialog", { name: "Launch" });
        const name = within(sheet).getByRole("textbox", {
            name: "Initiative name",
        });
        await waitFor(() => expect(name).toBeEnabled());
        expect(
            within(sheet).getByRole("combobox", { name: "Project" }),
        ).toHaveValue(String(checkout.id));

        await user.type(name, " v2");
        expect(
            await within(sheet).findByText("Saved", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();

        expect(initiativeRows({ hidden: true })).toEqual(["Launch v2"]);
        expect(
            screen.getByRole("textbox", {
                name: "Project name",
                hidden: true,
            }),
        ).toHaveValue("Checkout");
    });

    it("removes an initiative that moves to another project from the list", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
            horizon: "now",
        });
        const user = await openProject("Checkout");
        await user.click(
            await within(initiativesList()).findByRole("button", {
                name: /^Launch/,
            }),
        );
        const sheet = await screen.findByRole("dialog", { name: "Launch" });
        const project = within(sheet).getByRole("combobox", {
            name: "Project",
        });
        await waitFor(() => expect(project).toBeEnabled());

        await user.selectOptions(project, String(billing.id));

        await waitFor(() => expect(launch.projectId).toBe(billing.id));
        await user.keyboard("{Escape}");
        await waitFor(() => expect(initiativeRows()).toEqual([]));
        expect(
            within(initiativesList()).getByText("No initiatives"),
        ).toBeInTheDocument();
    });

    it("removes a deleted initiative from the list, and Undo brings it back", async () => {
        backend.seedInitiative({
            name: "Launch",
            project: checkout,
            horizon: "now",
        });
        const user = await openProject("Checkout");
        await user.click(
            await within(initiativesList()).findByRole("button", {
                name: /^Launch/,
            }),
        );
        const sheet = await screen.findByRole("dialog", { name: "Launch" });
        await waitFor(() =>
            expect(
                within(sheet).getByRole("button", { name: "Delete" }),
            ).toBeEnabled(),
        );

        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        await within(notifications()).findByText('Deleted "Launch".');
        await waitFor(() => expect(initiativeRows()).toEqual([]));

        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        await waitFor(() => expect(initiativeRows()).toEqual(["Launch"]));
    });

    it("creates an initiative in the project with New initiative", async () => {
        const user = await openProject("Checkout");

        await user.click(
            within(initiativesList()).getByRole("button", {
                name: "New initiative",
            }),
        );
        const sheet = await screen.findByRole("dialog", {
            name: "Untitled initiative",
        });
        expect(
            within(sheet).getByRole("combobox", { name: "Project" }),
        ).toHaveValue(String(checkout.id));
        await user.type(
            within(sheet).getByRole("textbox", { name: "Initiative name" }),
            "Launch",
        );

        await waitFor(
            () =>
                expect(backend.initiatives).toEqual([
                    expect.objectContaining({
                        name: "Launch",
                        projectId: checkout.id,
                    }),
                ]),
            SAVE_TIMEOUT,
        );
        await waitFor(() =>
            expect(initiativeRows({ hidden: true })).toEqual(["Launch"]),
        );
    });
});

describe("The meetings of a project", () => {
    it("lists the meetings about the project that are not deleted, newest first, with their dates", async () => {
        backend.seedMeeting("Kickoff", [], {
            project: checkout,
            date: "2026-09-20",
        });
        backend.seedMeeting("Review", [], {
            project: checkout,
            date: "2026-09-24",
        });
        backend.seedMeeting("Gone", [], {
            project: checkout,
            deleted: true,
        });
        backend.seedMeeting("Billing sync", [], { project: billing });
        backend.seedMeeting("1:1");
        await openProject("Checkout");

        await waitFor(() => expect(meetingRows()).toHaveLength(2));
        const [review, kickoff] = meetingRows();
        expect(review).toMatch(/^Review/);
        expect(review).toContain("Sep 24");
        expect(kickoff).toMatch(/^Kickoff/);
    });

    it("says No meetings when there are none", async () => {
        await openProject("Checkout");

        expect(
            await within(meetingsList()).findByText("No meetings"),
        ).toBeInTheDocument();
    });

    it("opens the editor page of a meeting", async () => {
        backend.seedMeeting("Kickoff", [], { project: checkout });
        const user = await openProject("Checkout");

        await user.click(
            await within(meetingsList()).findByRole("link", {
                name: /^Kickoff/,
            }),
        );

        expect(
            await screen.findByRole("textbox", { name: "Meeting name" }),
        ).toHaveValue("Kickoff");
    });
});

describe("A project that does not exist", () => {
    it("says so and links back to the Projects page", async () => {
        const user = userEvent.setup();
        render(<App />);
        await user.click(
            within(mainNavigation()).getByRole("link", { name: "Projects" }),
        );
        const link = await screen.findByRole("link", { name: "Checkout" });
        // The project is removed after the list has loaded, so its page finds nothing.
        backend.projects = backend.projects.filter((p) => p !== checkout);

        await user.click(link);

        expect(
            await screen.findByText(/This project doesn't exist\./),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole("link", { name: "Back to Projects" }),
        );
        expect(
            await screen.findByRole("button", { name: "New project" }),
        ).toBeInTheDocument();
    });
});
