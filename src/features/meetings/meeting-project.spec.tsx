import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeRoadmapBackend } from "@/test/fake-roadmap-backend";

// Feature spec for the project of a meeting in docs/specs/0008-projects.md, with the changes of
// docs/specs/0009-meetings-cover-several-initiatives.md. The initiatives of a meeting whose
// project changes are checked in meeting-initiatives.spec.tsx.
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

function chooseButton() {
    return within(meetingDetails()).getByRole("button", {
        name: "Choose initiatives",
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
    it("shows a Project row between the Date row and the Initiatives row", async () => {
        backend.seedMeeting("Weekly sync");
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        const sidebar = meetingDetails();
        expect(
            within(sidebar).getByText("Project", { selector: "label" }),
        ).toHaveAttribute("for", projectSelect().id);
        const date = within(sidebar).getByLabelText("Meeting date");
        expect(follows(date, projectSelect())).toBe(true);
        expect(follows(projectSelect(), chooseButton())).toBe(true);
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
        backend.seedMeeting("Weekly sync", [], { project: checkout });
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
        const meeting = backend.seedMeeting("Weekly sync", [], {
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
