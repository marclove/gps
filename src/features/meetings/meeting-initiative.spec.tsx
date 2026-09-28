import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import {
    FakeRoadmapBackend,
    type StoredProject,
} from "@/test/fake-roadmap-backend";

// Feature spec for the assignment of a meeting to an initiative in
// docs/specs/0006-managing-initiatives.md, with the changes of
// docs/specs/0007-deleted-rows-and-ranked-order.md and docs/specs/0008-projects.md.
// The Tauri backend is replaced by an in-memory fake of the meeting and initiative commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeRoadmapBackend;
let unsorted: StoredProject;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeRoadmapBackend();
    // The select box offers only the initiatives of the meeting's project, so every meeting
    // and initiative of these specs is in this project.
    unsorted = backend.seedProject("Unsorted");
    invoke.mockImplementation(backend.handle);
});

type User = ReturnType<typeof userEvent.setup>;

function renderApp() {
    const user = userEvent.setup();
    render(<App />);
    return user;
}

function meetingDetails() {
    return screen.getByRole("complementary", { name: "Meeting details" });
}

function initiativeSelect() {
    return within(meetingDetails()).getByRole<HTMLSelectElement>("combobox", {
        name: "Meeting initiative",
    });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

async function openMeeting(user: User, name: RegExp) {
    await user.click(await screen.findByRole("link", { name }));
    await screen.findByRole("textbox", { name: "Notes" });
    await waitFor(() => expect(initiativeSelect()).toBeEnabled());
}

/**
 * The choices of the select box: the text of each choice outside a group, and the
 * label of each group followed by the texts of its choices.
 */
function choices(): (string | [string, string[]])[] {
    return Array.from(initiativeSelect().children).map((child) =>
        child instanceof HTMLOptGroupElement
            ? [
                  child.label,
                  Array.from(child.children).map(
                      (option) => (option as HTMLOptionElement).text,
                  ),
              ]
            : (child as HTMLOptionElement).text,
    );
}

function selectedText() {
    return initiativeSelect().selectedOptions[0].text;
}

describe("Assigning a meeting to an initiative", () => {
    it("shows an Initiative row between the Date row and the Delete button", async () => {
        backend.seedMeeting("Weekly sync", null, { project: unsorted });
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        const sidebar = meetingDetails();
        const date = within(sidebar).getByLabelText("Meeting date");
        const initiative = initiativeSelect();
        const deleteButton = within(sidebar).getByRole("button", {
            name: "Delete",
        });
        expect(within(sidebar).getByText("Initiative")).toBeInTheDocument();
        expect(
            date.compareDocumentPosition(initiative) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            initiative.compareDocumentPosition(deleteButton) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("groups the choices by column in roadmap order, then Completed alphabetically, and leaves out deleted initiatives", async () => {
        backend.seedInitiative({ name: "zeta pilot", deleted: true });
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.seedInitiative({ name: "Checkout", horizon: "later" });
        backend.seedInitiative({ name: "", horizon: "later" });
        backend.seedInitiative({ name: "beta win", completed: true });
        backend.seedInitiative({ name: "Alpha win", completed: true });
        backend.seedInitiative({ name: "Alpha program", deleted: true });
        backend.seedInitiative({
            name: "Old win",
            completed: true,
            deleted: true,
        });
        backend.seedMeeting("Weekly sync", null, { project: unsorted });
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        expect(choices()).toEqual([
            "",
            ["Now", ["Launch"]],
            ["Later", ["Checkout", "Untitled initiative"]],
            ["Completed", ["Alpha win", "beta win"]],
        ]);
        expect(initiativeSelect()).toHaveValue("");
        expect(invoke).toHaveBeenCalledWith("list_initiatives", {
            includeDeleted: true,
        });
    });

    it("shows the meeting's own deleted initiative as the last choice, and no other deleted one", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.seedInitiative({ name: "Gone", deleted: true });
        const pilot = backend.seedInitiative({ name: "Pilot", deleted: true });
        backend.seedMeeting("Weekly sync", pilot.id);
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        expect(choices()).toEqual(["", ["Now", ["Launch"]], "Pilot"]);
        expect(initiativeSelect()).toHaveValue(String(pilot.id));
        expect(selectedText()).toBe("Pilot");
    });

    it("removes the deleted initiative from the choices once another choice is saved", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            horizon: "now",
        });
        const pilot = backend.seedInitiative({ name: "Pilot", deleted: true });
        const meeting = backend.seedMeeting("Weekly sync", pilot.id);
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(initiativeSelect(), String(launch.id));

        await waitFor(() => expect(meeting.initiativeId).toBe(launch.id));
        expect(choices()).toEqual(["", ["Now", ["Launch"]]]);
    });

    it("shows the deleted initiative again when the other choice cannot be saved", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            horizon: "now",
        });
        const pilot = backend.seedInitiative({ name: "Pilot", deleted: true });
        backend.seedMeeting("Weekly sync", pilot.id);
        backend.failing.add("set_meeting_initiative");
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(initiativeSelect(), String(launch.id));

        await waitFor(() =>
            expect(initiativeSelect()).toHaveValue(String(pilot.id)),
        );
        expect(selectedText()).toBe("Pilot");
    });

    it("saves the assignment at once and keeps it when the meeting opens again", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            horizon: "now",
        });
        const meeting = backend.seedMeeting("Weekly sync", null, {
            project: unsorted,
        });
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(initiativeSelect(), String(launch.id));

        expect(invoke).toHaveBeenCalledWith("set_meeting_initiative", {
            id: meeting.id,
            initiativeId: launch.id,
        });
        expect(invoke).not.toHaveBeenCalledWith(
            "update_meeting",
            expect.anything(),
        );
        expect(screen.queryByText("Saved")).not.toBeInTheDocument();

        await user.click(
            within(screen.getByRole("navigation", { name: "Main" })).getByRole(
                "link",
                { name: "Meetings" },
            ),
        );
        await openMeeting(user, /Weekly sync/);
        expect(initiativeSelect()).toHaveValue(String(launch.id));
    });

    it("can reassign a meeting to a completed initiative", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const won = backend.seedInitiative({ name: "Won", completed: true });
        const meeting = backend.seedMeeting("Weekly sync", null, {
            project: unsorted,
        });
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(initiativeSelect(), String(won.id));

        await waitFor(() => expect(meeting.initiativeId).toBe(won.id));
    });

    it("removes the assignment when the empty choice is selected", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            horizon: "now",
        });
        const meeting = backend.seedMeeting("Weekly sync", launch.id);
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(initiativeSelect(), "");

        expect(invoke).toHaveBeenCalledWith("set_meeting_initiative", {
            id: meeting.id,
            initiativeId: null,
        });
        await waitFor(() => expect(meeting.initiativeId).toBeNull());
    });

    it("goes back to the saved choice and shows a failure toast when the assignment fails", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            horizon: "now",
        });
        const pilot = backend.seedInitiative({
            name: "Pilot",
            horizon: "next",
        });
        backend.seedMeeting("Weekly sync", launch.id);
        backend.failing.add("set_meeting_initiative");
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(initiativeSelect(), String(pilot.id));

        const message = "Couldn't assign the initiative. Try again.";
        expect(
            await within(notifications()).findByText(message),
        ).toBeInTheDocument();
        expect(screen.getAllByText(message)).toHaveLength(1);
        await waitFor(() =>
            expect(initiativeSelect()).toHaveValue(String(launch.id)),
        );

        backend.failing.delete("set_meeting_initiative");
        await user.selectOptions(initiativeSelect(), String(pilot.id));
        await waitFor(() =>
            expect(
                within(notifications()).queryByText(message),
            ).not.toBeInTheDocument(),
        );
    });

    it("says so when the initiatives cannot be loaded, and loads them again on Retry", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.seedMeeting("Weekly sync", null, { project: unsorted });
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

        await waitFor(() => expect(initiativeSelect()).toBeEnabled());
        expect(choices()).toEqual(["", ["Now", ["Launch"]]]);
    });

    it("offers an initiative again when its delete is undone while a meeting is open", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.seedInitiative({ name: "Pilot", horizon: "next" });
        backend.seedMeeting("Weekly sync", null, { project: unsorted });
        const user = renderApp();
        const mainNavigation = () =>
            screen.getByRole("navigation", { name: "Main" });

        await user.click(
            within(mainNavigation()).getByRole("link", { name: "Initiatives" }),
        );
        await user.click(
            await screen.findByRole("button", { name: /^Launch/ }),
        );
        const sheet = await screen.findByRole("dialog", { name: "Launch" });
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));
        await within(notifications()).findByText('Deleted "Launch".');

        await user.click(
            within(mainNavigation()).getByRole("link", { name: "Meetings" }),
        );
        await openMeeting(user, /Weekly sync/);
        expect(choices()).toEqual(["", ["Next", ["Pilot"]]]);

        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        await waitFor(() =>
            expect(choices()).toEqual([
                "",
                ["Now", ["Launch"]],
                ["Next", ["Pilot"]],
            ]),
        );
        expect(initiativeSelect()).toHaveValue("");
    });
});
