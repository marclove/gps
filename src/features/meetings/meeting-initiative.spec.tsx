import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

// Feature spec for the assignment of a meeting to an initiative in
// docs/specs/0006-managing-initiatives.md.
// The Tauri backend is replaced by an in-memory fake of the meeting and initiative commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

type Meeting = {
    id: number;
    name: string;
    date: string;
    notes: string;
    initiativeId: number | null;
    createdAt: string;
    updatedAt: string;
};

type InitiativeSummary = {
    id: number;
    name: string;
    raciRole: string | null;
    updatedAt: string;
    archivedAt: string | null;
    createdAt: string;
};

class FakeBackend {
    meetings: Meeting[] = [];
    initiatives: InitiativeSummary[] = [];
    failAssign = false;
    failNextListInitiatives = false;
    private nextId = 1;
    private clock = 0;

    private now(): string {
        this.clock += 1;
        return new Date(Date.UTC(2026, 8, 24, 10, 0, this.clock)).toISOString();
    }

    seedMeeting(name: string, initiativeId: number | null = null): Meeting {
        const now = this.now();
        const meeting: Meeting = {
            id: this.nextId++,
            name,
            date: "2026-09-24",
            notes: "",
            initiativeId,
            createdAt: now,
            updatedAt: now,
        };
        this.meetings.push(meeting);
        return meeting;
    }

    seedInitiative(name: string, archived = false): InitiativeSummary {
        const now = this.now();
        const initiative: InitiativeSummary = {
            id: this.nextId++,
            name,
            raciRole: null,
            createdAt: now,
            updatedAt: now,
            archivedAt: archived ? now : null,
        };
        this.initiatives.push(initiative);
        return initiative;
    }

    handle = async (
        command: string,
        args: Record<string, unknown> = {},
    ): Promise<unknown> => {
        switch (command) {
            case "list_meetings":
                return this.meetings.map(({ id, name, date, updatedAt }) => ({
                    id,
                    name,
                    date,
                    updatedAt,
                }));
            case "get_meeting":
                return this.meetings.find((m) => m.id === args.id) ?? null;
            case "list_meeting_tasks":
                return [];
            case "update_meeting": {
                const meeting = this.meetings.find((m) => m.id === args.id);
                if (!meeting) throw `meeting ${String(args.id)} not found`;
                Object.assign(meeting, {
                    name: args.name,
                    date: args.date,
                    notes: args.notes,
                    updatedAt: this.now(),
                });
                return meeting;
            }
            case "list_initiatives": {
                if (this.failNextListInitiatives) {
                    this.failNextListInitiatives = false;
                    throw "database is locked";
                }
                return this.initiatives
                    .filter(
                        (initiative) =>
                            args.includeArchived === true ||
                            initiative.archivedAt === null,
                    )
                    .sort(
                        (a, b) =>
                            b.createdAt.localeCompare(a.createdAt) ||
                            b.id - a.id,
                    )
                    .map(({ id, name, raciRole, updatedAt, archivedAt }) => ({
                        id,
                        name,
                        raciRole,
                        updatedAt,
                        archivedAt,
                    }));
            }
            case "set_meeting_initiative": {
                if (this.failAssign) throw "database is locked";
                const meeting = this.meetings.find((m) => m.id === args.id);
                if (!meeting) throw `meeting ${String(args.id)} not found`;
                const initiativeId = args.initiativeId as number | null;
                if (
                    initiativeId !== null &&
                    !this.initiatives.some((i) => i.id === initiativeId)
                ) {
                    throw `initiative ${String(initiativeId)} not found`;
                }
                meeting.initiativeId = initiativeId;
                meeting.updatedAt = this.now();
                return meeting;
            }
            default:
                throw `unexpected command ${command}`;
        }
    };
}

let backend: FakeBackend;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
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

function optionTexts(): string[] {
    return Array.from(initiativeSelect().options).map((option) => option.text);
}

describe("Assigning a meeting to an initiative", () => {
    it("shows an Initiative row between the Date row and the Archive button", async () => {
        backend.seedMeeting("Weekly sync");
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        const sidebar = meetingDetails();
        const date = within(sidebar).getByLabelText("Meeting date");
        const initiative = initiativeSelect();
        const archive = within(sidebar).getByRole("button", {
            name: "Archive",
        });
        expect(within(sidebar).getByText("Initiative")).toBeInTheDocument();
        expect(
            date.compareDocumentPosition(initiative) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            initiative.compareDocumentPosition(archive) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("lists the empty choice, active initiatives in list order, then archived ones alphabetically", async () => {
        backend.seedInitiative("zeta pilot", true);
        backend.seedInitiative("Checkout redesign");
        backend.seedInitiative("Alpha program", true);
        backend.seedInitiative("");
        backend.seedInitiative("Launch");
        backend.seedInitiative("Beta rollout", true);
        backend.seedMeeting("Weekly sync");
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        expect(optionTexts()).toEqual([
            "",
            "Launch",
            "Untitled initiative",
            "Checkout redesign",
            "Alpha program (archived)",
            "Beta rollout (archived)",
            "zeta pilot (archived)",
        ]);
        expect(initiativeSelect()).toHaveValue("");
        expect(invoke).toHaveBeenCalledWith("list_initiatives", {
            includeArchived: true,
        });
    });

    it("selects the initiative the meeting is assigned to, even if it is archived", async () => {
        backend.seedInitiative("Launch");
        const pilot = backend.seedInitiative("Pilot", true);
        backend.seedMeeting("Weekly sync", pilot.id);
        const user = renderApp();

        await openMeeting(user, /Weekly sync/);

        const select = initiativeSelect();
        expect(select).toHaveValue(String(pilot.id));
        expect(select.selectedOptions[0].text).toBe("Pilot (archived)");
    });

    it("saves the assignment at once and keeps it when the meeting opens again", async () => {
        const launch = backend.seedInitiative("Launch");
        const meeting = backend.seedMeeting("Weekly sync");
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(initiativeSelect(), "Launch");

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

    it("can reassign a meeting to an archived initiative", async () => {
        backend.seedInitiative("Launch");
        const pilot = backend.seedInitiative("Pilot", true);
        const meeting = backend.seedMeeting("Weekly sync", pilot.id);
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(initiativeSelect(), "Launch");
        await user.selectOptions(initiativeSelect(), "Pilot (archived)");

        await waitFor(() =>
            expect(backend.meetings[0].initiativeId).toBe(pilot.id),
        );
        expect(invoke).toHaveBeenLastCalledWith("set_meeting_initiative", {
            id: meeting.id,
            initiativeId: pilot.id,
        });
    });

    it("removes the assignment when the empty choice is selected", async () => {
        const launch = backend.seedInitiative("Launch");
        const meeting = backend.seedMeeting("Weekly sync", launch.id);
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(initiativeSelect(), "");

        expect(invoke).toHaveBeenCalledWith("set_meeting_initiative", {
            id: meeting.id,
            initiativeId: null,
        });
        await waitFor(() =>
            expect(backend.meetings[0].initiativeId).toBeNull(),
        );
    });

    it("goes back to the saved choice and shows a failure toast when the assignment fails", async () => {
        const launch = backend.seedInitiative("Launch");
        backend.seedInitiative("Pilot");
        backend.seedMeeting("Weekly sync", launch.id);
        backend.failAssign = true;
        const user = renderApp();
        await openMeeting(user, /Weekly sync/);

        await user.selectOptions(initiativeSelect(), "Pilot");

        const message = "Couldn't assign the initiative. Try again.";
        expect(
            await within(notifications()).findByText(message),
        ).toBeInTheDocument();
        expect(screen.getAllByText(message)).toHaveLength(1);
        await waitFor(() =>
            expect(initiativeSelect()).toHaveValue(String(launch.id)),
        );

        backend.failAssign = false;
        await user.selectOptions(initiativeSelect(), "Pilot");
        await waitFor(() =>
            expect(
                within(notifications()).queryByText(message),
            ).not.toBeInTheDocument(),
        );
    });

    it("says so when the initiatives cannot be loaded, and loads them again on Retry", async () => {
        backend.seedInitiative("Launch");
        backend.seedMeeting("Weekly sync");
        backend.failNextListInitiatives = true;
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
        expect(optionTexts()).toEqual(["", "Launch"]);
    });
});
