import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeRoadmapBackend } from "@/test/fake-roadmap-backend";

// Feature spec for the project of a meeting in docs/specs/0008-projects.md.
// The Tauri backend is replaced by an in-memory fake of the project, meeting, and initiative
// commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeRoadmapBackend;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeRoadmapBackend();
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

function projectSelect() {
    return within(meetingDetails()).getByRole<HTMLSelectElement>("combobox", {
        name: "Meeting project",
    });
}

function initiativeSelect() {
    return within(meetingDetails()).getByRole<HTMLSelectElement>("combobox", {
        name: "Meeting initiative",
    });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

function optionTexts(select: HTMLSelectElement): string[] {
    return Array.from(select.options).map((option) => option.text);
}

async function openMeeting(user: User, name: RegExp) {
    await user.click(await screen.findByRole("link", { name }));
    await screen.findByRole("textbox", { name: "Notes" });
    await waitFor(() => expect(projectSelect()).toBeEnabled());
}

function follows(first: Element, second: Element) {
    return Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
}

describe("The project of a meeting", () => {
    it("shows a Project row between the Date row and the Initiative row", async () => {
        backend.seedMeeting("Weekly sync");
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        const sidebar = meetingDetails();
        expect(
            within(sidebar).getByText("Project", { selector: "label" }),
        ).toHaveAttribute("for", projectSelect().id);
        const date = within(sidebar).getByLabelText("Meeting date");
        expect(follows(date, projectSelect())).toBe(true);
        expect(follows(projectSelect(), initiativeSelect())).toBe(true);
    });

    it("offers no project and the projects that are not deleted, by name without regard to case", async () => {
        backend.seedProject("checkout");
        backend.seedProject("Billing");
        backend.seedProject("Old", { deleted: true });
        backend.seedMeeting("Weekly sync");
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        expect(optionTexts(projectSelect())).toEqual([
            "",
            "Billing",
            "checkout",
        ]);
        expect(projectSelect()).toHaveValue("");
    });

    it("saves the project at once and keeps it when the meeting opens again", async () => {
        const checkout = backend.seedProject("Checkout");
        const meeting = backend.seedMeeting("Weekly sync");
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(projectSelect(), "Checkout");

        expect(invoke).toHaveBeenCalledWith("set_meeting_project", {
            id: meeting.id,
            projectId: checkout.id,
        });
        await waitFor(() => expect(meeting.projectId).toBe(checkout.id));

        await user.click(
            within(screen.getByRole("navigation", { name: "Main" })).getByRole(
                "link",
                { name: "Meetings" },
            ),
        );
        await openMeeting(user, /Weekly sync/);
        expect(projectSelect()).toHaveValue(String(checkout.id));
    });

    it("goes back to the saved choice and shows a failure toast when the project cannot be saved", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedProject("Billing");
        backend.seedMeeting("Weekly sync", null, { project: checkout });
        backend.failing.add("set_meeting_project");
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(projectSelect(), "Billing");

        expect(
            await within(notifications()).findByText(
                "Couldn't change the project. Try again.",
            ),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(projectSelect()).toHaveValue(String(checkout.id)),
        );
    });

    it("shows the meeting's deleted project as the last choice until another one is chosen", async () => {
        backend.seedProject("Checkout");
        const old = backend.seedProject("Old", { deleted: true });
        const meeting = backend.seedMeeting("Weekly sync", null, {
            project: old,
        });
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        expect(optionTexts(projectSelect())).toEqual(["", "Checkout", "Old"]);
        expect(projectSelect()).toHaveValue(String(old.id));

        await user.selectOptions(projectSelect(), "");

        await waitFor(() => expect(meeting.projectId).toBeNull());
        expect(optionTexts(projectSelect())).toEqual(["", "Checkout"]);
    });
});

describe("The initiative of a meeting with a project", () => {
    it("offers only the initiatives of the meeting's project", async () => {
        const checkout = backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        backend.seedInitiative({
            name: "Launch",
            horizon: "now",
            project: checkout,
        });
        backend.seedInitiative({
            name: "Invoices",
            horizon: "now",
            project: billing,
        });
        backend.seedMeeting("Weekly sync", null, { project: checkout });
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        await waitFor(() => expect(initiativeSelect()).toBeEnabled());
        expect(optionTexts(initiativeSelect())).toEqual(["", "Launch"]);
    });

    it("offers no initiative and is disabled when the meeting has no project", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.seedMeeting("Weekly sync");
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        await waitFor(() =>
            expect(optionTexts(initiativeSelect())).toEqual([""]),
        );
        expect(initiativeSelect()).toBeDisabled();
    });

    it("clears the initiative when the project changes, and offers the initiatives of the new project", async () => {
        const checkout = backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        const launch = backend.seedInitiative({
            name: "Launch",
            horizon: "now",
            project: checkout,
        });
        backend.seedInitiative({
            name: "Invoices",
            horizon: "now",
            project: billing,
        });
        const meeting = backend.seedMeeting("Weekly sync", launch.id);
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);
        await waitFor(() =>
            expect(initiativeSelect()).toHaveValue(String(launch.id)),
        );

        await user.selectOptions(projectSelect(), "Billing");

        await waitFor(() => expect(meeting.initiativeId).toBeNull());
        expect(meeting.projectId).toBe(billing.id);
        await waitFor(() =>
            expect(optionTexts(initiativeSelect())).toEqual(["", "Invoices"]),
        );
        expect(initiativeSelect()).toHaveValue("");
    });

    it("shows the project of the initiative for a meeting that is assigned to one", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedProject("Billing");
        const launch = backend.seedInitiative({
            name: "Launch",
            horizon: "now",
            project: checkout,
        });
        backend.seedMeeting("Weekly sync", launch.id);
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        expect(projectSelect()).toHaveValue(String(checkout.id));
    });
});
