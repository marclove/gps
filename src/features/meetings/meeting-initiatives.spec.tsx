import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeBackend, type StoredProject } from "@/test/fake-backend";

// Feature spec for the initiatives of a meeting in
// docs/specs/0009-meetings-cover-several-initiatives.md.
// The Tauri backend is replaced by an in-memory fake of the project, meeting, and initiative
// commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeBackend;
let checkout: StoredProject;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    // The popover offers only the initiatives of the meeting's project, so the initiatives of
    // these specs are in this project unless a spec says otherwise.
    checkout = backend.seedProject("Checkout");
    invoke.mockImplementation(backend.handle);
});

type User = ReturnType<typeof userEvent.setup>;

function renderApp() {
    const user = userEvent.setup();
    render(<App />);
    return user;
}

function mainNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

function meetingDetails() {
    return screen.getByRole("complementary", { name: "Meeting details" });
}

function chooseButton() {
    return within(meetingDetails()).getByRole("button", {
        name: "Choose initiatives",
    });
}

function projectSelect() {
    return within(meetingDetails()).getByRole<HTMLSelectElement>("combobox", {
        name: "Meeting project",
    });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

/** The texts of the list "Meeting initiatives", or an empty list when the row has no list. */
function coveredNames(): string[] {
    const list = within(meetingDetails()).queryByRole("list", {
        name: "Meeting initiatives",
    });
    if (list === null) return [];
    return within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent ?? "");
}

async function openMeeting(user: User, name: RegExp) {
    await user.click(await screen.findByRole("link", { name }));
    await screen.findByRole("textbox", { name: "Notes" });
    await waitFor(() => expect(projectSelect()).toBeEnabled());
}

/** Opens the meeting and waits until its initiatives are loaded. */
async function openMeetingWithProject(user: User, name: RegExp) {
    await openMeeting(user, name);
    await waitFor(() => expect(chooseButton()).toBeEnabled());
}

async function openPopover(user: User) {
    await user.click(chooseButton());
    return screen.findByRole("dialog", { name: "Choose initiatives" });
}

function checkbox(popover: HTMLElement, name: string) {
    return within(popover).getByRole("checkbox", { name });
}

/** Checks that the popover has exactly the checkboxes with these names, in this order. */
function expectCheckboxes(popover: HTMLElement, names: string[]) {
    expect(within(popover).queryAllByRole("checkbox")).toEqual(
        names.map((name) => checkbox(popover, name)),
    );
}

async function goToMeetings(user: User) {
    await user.click(
        within(mainNavigation()).getByRole("link", { name: "Meetings" }),
    );
}

function follows(first: Element, second: Element) {
    return Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
}

describe("The Initiatives row", () => {
    it("shows an Initiatives row between the Project row and the Delete button", async () => {
        backend.seedMeeting("Weekly sync", [], { project: checkout });
        const user = renderApp();

        await openMeetingWithProject(user, /Weekly sync/);

        const sidebar = meetingDetails();
        const label = within(sidebar).getByText("Initiatives");
        const deleteButton = within(sidebar).getByRole("button", {
            name: "Delete",
        });
        expect(follows(projectSelect(), label)).toBe(true);
        expect(follows(label, chooseButton())).toBe(true);
        expect(follows(chooseButton(), deleteButton)).toBe(true);
        expect(chooseButton()).toHaveTextContent("Choose");
        expect(
            within(sidebar).queryByRole("combobox", {
                name: "Meeting initiative",
            }),
        ).not.toBeInTheDocument();
    });

    it("says No initiatives when the meeting covers none", async () => {
        backend.seedInitiative({ name: "Launch" });
        backend.seedMeeting("Weekly sync", [], { project: checkout });
        const user = renderApp();

        await openMeetingWithProject(user, /Weekly sync/);

        expect(
            within(meetingDetails()).getByText("No initiatives"),
        ).toBeInTheDocument();
        expect(coveredNames()).toEqual([]);
    });

    it("lists the initiatives of the meeting by shown name without regard to case", async () => {
        const pilot = backend.seedInitiative({ name: "pilot", horizon: "now" });
        const untitled = backend.seedInitiative({ name: "" });
        const launch = backend.seedInitiative({
            name: "Launch",
            completed: true,
        });
        const migration = backend.seedInitiative({
            name: "Migration",
            deleted: true,
        });
        backend.seedInitiative({ name: "Alpha" });
        backend.seedMeeting("Weekly sync", [
            pilot.id,
            untitled.id,
            launch.id,
            migration.id,
        ]);
        const user = renderApp();

        await openMeetingWithProject(user, /Weekly sync/);

        expect(coveredNames()).toEqual([
            "Launch",
            "Migration (deleted)",
            "pilot",
            "Untitled initiative",
        ]);
        expect(
            within(meetingDetails()).queryByText("No initiatives"),
        ).not.toBeInTheDocument();
    });

    it("disables Choose when the meeting has no project", async () => {
        backend.seedInitiative({ name: "Launch" });
        backend.seedMeeting("Weekly sync");
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        await waitFor(() =>
            expect(
                within(meetingDetails()).getByText("No initiatives"),
            ).toBeInTheDocument(),
        );
        expect(chooseButton()).toBeDisabled();
    });

    it("says so when the initiatives cannot be loaded, and loads them again on Retry", async () => {
        const launch = backend.seedInitiative({ name: "Launch" });
        backend.seedMeeting("Weekly sync", [launch.id]);
        backend.failingOnce.add("list_initiatives");
        const user = renderApp();

        await user.click(
            await screen.findByRole("link", { name: /Weekly sync/ }),
        );
        const sidebar = await screen.findByRole("complementary", {
            name: "Meeting details",
        });
        expect(
            await within(sidebar).findByText("Couldn't load initiatives"),
        ).toBeInTheDocument();
        await user.click(
            within(sidebar).getByRole("button", { name: "Retry" }),
        );

        await waitFor(() => expect(chooseButton()).toBeEnabled());
        expect(coveredNames()).toEqual(["Launch"]);
    });
});

describe("Choosing the initiatives of a meeting", () => {
    it("offers the initiatives of the project and the meeting's deleted ones, alphabetically, and checks the ones that the meeting covers", async () => {
        const billing = backend.seedProject("Billing");
        const pilot = backend.seedInitiative({ name: "pilot", horizon: "now" });
        backend.seedInitiative({ name: "Launch", horizon: "later" });
        backend.seedInitiative({ name: "" });
        const beta = backend.seedInitiative({ name: "Beta", completed: true });
        const old = backend.seedInitiative({ name: "Old", deleted: true });
        backend.seedInitiative({ name: "Gone", deleted: true });
        backend.seedInitiative({ name: "Invoices", project: billing });
        backend.seedMeeting("Weekly sync", [pilot.id, beta.id, old.id]);
        const user = renderApp();
        await openMeetingWithProject(user, /Weekly sync/);

        const popover = await openPopover(user);

        expectCheckboxes(popover, [
            "Beta",
            "Launch",
            "Old (deleted)",
            "pilot",
            "Untitled initiative",
        ]);
        expect(checkbox(popover, "Beta")).toBeChecked();
        expect(checkbox(popover, "Launch")).not.toBeChecked();
        expect(checkbox(popover, "Old (deleted)")).toBeChecked();
        expect(checkbox(popover, "pilot")).toBeChecked();
        expect(checkbox(popover, "Untitled initiative")).not.toBeChecked();
        expect(within(popover).queryByRole("group")).not.toBeInTheDocument();
        expect(invoke).toHaveBeenCalledWith("list_initiatives", {
            includeDeleted: true,
        });
    });

    it("says so when the project has no initiatives", async () => {
        const billing = backend.seedProject("Billing");
        backend.seedInitiative({ name: "Launch", project: checkout });
        backend.seedMeeting("Weekly sync", [], { project: billing });
        const user = renderApp();
        await openMeetingWithProject(user, /Weekly sync/);

        const popover = await openPopover(user);

        expect(
            within(popover).getByText("This project has no initiatives."),
        ).toBeInTheDocument();
        expectCheckboxes(popover, []);
    });

    it("adds an initiative at once when it is checked, and keeps it when the meeting opens again", async () => {
        const launch = backend.seedInitiative({ name: "Launch" });
        backend.seedInitiative({ name: "Pilot" });
        const meeting = backend.seedMeeting("Weekly sync", [], {
            project: checkout,
        });
        const user = renderApp();
        await openMeetingWithProject(user, /Weekly sync/);
        const popover = await openPopover(user);

        await user.click(checkbox(popover, "Launch"));

        expect(invoke).toHaveBeenCalledWith("add_meeting_initiative", {
            id: meeting.id,
            initiativeId: launch.id,
        });
        expect(checkbox(popover, "Launch")).toBeChecked();
        expect(coveredNames()).toEqual(["Launch"]);
        await waitFor(() => expect(meeting.initiativeIds).toEqual([launch.id]));
        expect(invoke).not.toHaveBeenCalledWith(
            "update_meeting",
            expect.anything(),
        );
        expect(screen.queryByText("Saved")).not.toBeInTheDocument();

        await user.keyboard("{Escape}");
        await goToMeetings(user);
        await openMeetingWithProject(user, /Weekly sync/);
        expect(coveredNames()).toEqual(["Launch"]);
    });

    it("adds several initiatives, also a completed one, while the popover is open", async () => {
        const launch = backend.seedInitiative({ name: "Launch" });
        const pilot = backend.seedInitiative({ name: "Pilot" });
        const won = backend.seedInitiative({ name: "Won", completed: true });
        const meeting = backend.seedMeeting("Weekly sync", [], {
            project: checkout,
        });
        const user = renderApp();
        await openMeetingWithProject(user, /Weekly sync/);
        const popover = await openPopover(user);

        await user.click(checkbox(popover, "Won"));
        await user.click(checkbox(popover, "Launch"));
        await user.click(checkbox(popover, "Pilot"));

        expect(coveredNames()).toEqual(["Launch", "Pilot", "Won"]);
        await waitFor(() =>
            expect(meeting.initiativeIds).toEqual([
                launch.id,
                pilot.id,
                won.id,
            ]),
        );
    });

    it("removes an initiative at once when it is unchecked", async () => {
        const launch = backend.seedInitiative({ name: "Launch" });
        const pilot = backend.seedInitiative({ name: "Pilot" });
        const meeting = backend.seedMeeting("Weekly sync", [
            launch.id,
            pilot.id,
        ]);
        const user = renderApp();
        await openMeetingWithProject(user, /Weekly sync/);
        const popover = await openPopover(user);

        await user.click(checkbox(popover, "Launch"));

        expect(invoke).toHaveBeenCalledWith("remove_meeting_initiative", {
            id: meeting.id,
            initiativeId: launch.id,
        });
        expect(checkbox(popover, "Launch")).not.toBeChecked();
        expect(coveredNames()).toEqual(["Pilot"]);
        await waitFor(() => expect(meeting.initiativeIds).toEqual([pilot.id]));
        expect(meeting.projectId).toBe(checkout.id);
    });

    it("unchecks the initiative again and shows a failure toast when it cannot be added", async () => {
        backend.seedInitiative({ name: "Launch" });
        const meeting = backend.seedMeeting("Weekly sync", [], {
            project: checkout,
        });
        backend.failing.add("add_meeting_initiative");
        const user = renderApp();
        await openMeetingWithProject(user, /Weekly sync/);
        const popover = await openPopover(user);

        await user.click(checkbox(popover, "Launch"));

        const message = "Couldn't add the initiative. Try again.";
        expect(
            await within(notifications()).findByText(message),
        ).toBeInTheDocument();
        expect(screen.getAllByText(message)).toHaveLength(1);
        await waitFor(() =>
            expect(checkbox(popover, "Launch")).not.toBeChecked(),
        );
        expect(coveredNames()).toEqual([]);
        expect(meeting.initiativeIds).toEqual([]);
    });

    it("checks the initiative again and shows a failure toast when it cannot be removed", async () => {
        const launch = backend.seedInitiative({ name: "Launch" });
        const meeting = backend.seedMeeting("Weekly sync", [launch.id]);
        backend.failing.add("remove_meeting_initiative");
        const user = renderApp();
        await openMeetingWithProject(user, /Weekly sync/);
        const popover = await openPopover(user);

        await user.click(checkbox(popover, "Launch"));

        expect(
            await within(notifications()).findByText(
                "Couldn't remove the initiative. Try again.",
            ),
        ).toBeInTheDocument();
        await waitFor(() => expect(checkbox(popover, "Launch")).toBeChecked());
        expect(coveredNames()).toEqual(["Launch"]);
        expect(meeting.initiativeIds).toEqual([launch.id]);
    });

    it("no longer offers a deleted initiative once its removal is saved", async () => {
        const launch = backend.seedInitiative({ name: "Launch" });
        const old = backend.seedInitiative({ name: "Old", deleted: true });
        const meeting = backend.seedMeeting("Weekly sync", [launch.id, old.id]);
        const user = renderApp();
        await openMeetingWithProject(user, /Weekly sync/);
        const popover = await openPopover(user);

        await user.click(checkbox(popover, "Old (deleted)"));

        await waitFor(() => expectCheckboxes(popover, ["Launch"]));
        expect(coveredNames()).toEqual(["Launch"]);
        expect(meeting.initiativeIds).toEqual([launch.id]);
    });

    it("closes the popover on Escape and moves the focus back to Choose", async () => {
        backend.seedInitiative({ name: "Launch" });
        backend.seedMeeting("Weekly sync", [], { project: checkout });
        const user = renderApp();
        await openMeetingWithProject(user, /Weekly sync/);
        await openPopover(user);

        await user.keyboard("{Escape}");

        await waitFor(() =>
            expect(
                screen.queryByRole("dialog", { name: "Choose initiatives" }),
            ).not.toBeInTheDocument(),
        );
        expect(chooseButton()).toHaveFocus();
    });

    it("offers an initiative again when its delete is undone while a meeting is open", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.seedInitiative({ name: "Pilot", horizon: "next" });
        backend.seedMeeting("Weekly sync", [], { project: checkout });
        const user = renderApp();

        await user.click(
            within(mainNavigation()).getByRole("link", { name: "Initiatives" }),
        );
        await user.click(
            await screen.findByRole("button", { name: /^Launch/ }),
        );
        const sheet = await screen.findByRole("dialog", { name: "Launch" });
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));
        await within(notifications()).findByText('Deleted "Launch".');

        await goToMeetings(user);
        await openMeetingWithProject(user, /Weekly sync/);
        const popover = await openPopover(user);
        expectCheckboxes(popover, ["Pilot"]);
        await user.keyboard("{Escape}");

        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );
        await waitFor(() =>
            expect(backend.find("Launch").deletedAt).toBeNull(),
        );

        const reopened = await openPopover(user);
        await waitFor(() => expectCheckboxes(reopened, ["Launch", "Pilot"]));
    });
});

describe("The initiatives of a meeting whose project changes", () => {
    it("shows the project of its initiatives for a meeting that covers some", async () => {
        const billing = backend.seedProject("Billing");
        const invoices = backend.seedInitiative({
            name: "Invoices",
            project: billing,
        });
        backend.seedMeeting("Weekly sync", [invoices.id]);
        const user = renderApp();

        await openMeetingWithProject(user, /Weekly sync/);

        expect(projectSelect()).toHaveValue(String(billing.id));
        expect(coveredNames()).toEqual(["Invoices"]);
    });

    it("removes every initiative when the project changes, and offers the initiatives of the new project", async () => {
        const billing = backend.seedProject("Billing");
        const launch = backend.seedInitiative({ name: "Launch" });
        const pilot = backend.seedInitiative({ name: "Pilot" });
        backend.seedInitiative({ name: "Invoices", project: billing });
        const meeting = backend.seedMeeting("Weekly sync", [
            launch.id,
            pilot.id,
        ]);
        const user = renderApp();
        await openMeetingWithProject(user, /Weekly sync/);

        await user.selectOptions(projectSelect(), "Billing");

        await waitFor(() => expect(meeting.projectId).toBe(billing.id));
        expect(meeting.initiativeIds).toEqual([]);
        await waitFor(() =>
            expect(
                within(meetingDetails()).getByText("No initiatives"),
            ).toBeInTheDocument(),
        );
        await waitFor(() => expect(chooseButton()).toBeEnabled());
        const popover = await openPopover(user);
        expectCheckboxes(popover, ["Invoices"]);
        expect(checkbox(popover, "Invoices")).not.toBeChecked();
    });
});

describe("Moving an initiative that meetings cover to another project", () => {
    async function moveLaunchToBilling(user: User) {
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
        await waitFor(() =>
            expect(backend.find("Launch").projectId).toBe(
                backend.findProject("Billing").id,
            ),
        );
        await user.keyboard("{Escape}");
        await goToMeetings(user);
    }

    it("moves a meeting that covers only that initiative to the new project", async () => {
        const billing = backend.seedProject("Billing");
        const launch = backend.seedInitiative({ name: "Launch" });
        const meeting = backend.seedMeeting("Kickoff", [launch.id]);
        const user = renderApp();

        await moveLaunchToBilling(user);
        await openMeetingWithProject(user, /Kickoff/);

        expect(projectSelect()).toHaveValue(String(billing.id));
        expect(coveredNames()).toEqual(["Launch"]);
        expect(meeting.initiativeIds).toEqual([launch.id]);
    });

    it("keeps a meeting that covers another initiative in its project, without the moved one", async () => {
        backend.seedProject("Billing");
        const launch = backend.seedInitiative({ name: "Launch" });
        const pilot = backend.seedInitiative({ name: "Pilot" });
        const meeting = backend.seedMeeting("Weekly sync", [
            launch.id,
            pilot.id,
        ]);
        const user = renderApp();

        await moveLaunchToBilling(user);
        await openMeetingWithProject(user, /Weekly sync/);

        expect(projectSelect()).toHaveValue(String(checkout.id));
        expect(coveredNames()).toEqual(["Pilot"]);
        expect(meeting.initiativeIds).toEqual([pilot.id]);
    });

    it("keeps a meeting in its project when its other initiative is deleted", async () => {
        backend.seedProject("Billing");
        const launch = backend.seedInitiative({ name: "Launch" });
        const old = backend.seedInitiative({ name: "Old", deleted: true });
        const meeting = backend.seedMeeting("Weekly sync", [launch.id, old.id]);
        const user = renderApp();

        await moveLaunchToBilling(user);
        await openMeetingWithProject(user, /Weekly sync/);

        expect(projectSelect()).toHaveValue(String(checkout.id));
        expect(coveredNames()).toEqual(["Old (deleted)"]);
        expect(meeting.initiativeIds).toEqual([old.id]);
    });
});
