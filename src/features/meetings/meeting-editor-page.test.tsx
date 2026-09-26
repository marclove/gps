import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { ArchiveProvider } from "./archive-provider";
import type { Meeting } from "@/lib/meetings";
import { MeetingEditorPage } from "./meeting-editor-page";

/** Shows the Meetings list route the editor page opens after an archive. */
function MeetingsListRoute() {
    return <p>Meetings list</p>;
}

/** The region that holds the toasts. */
function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const MEETING: Meeting = {
    id: 42,
    name: "Weekly sync",
    date: "2026-09-24",
    notes: "",
    createdAt: "2026-09-24T17:00:00.000Z",
    updatedAt: "2026-09-24T17:00:00.000Z",
};

type Answer = (args?: Record<string, unknown>) => unknown;

/**
 * Makes the fake backend answer each command by its name. A command in `answers`
 * gets that answer. Otherwise `get_meeting` returns MEETING, `list_meeting_tasks`
 * returns no tasks, and every other command returns MEETING with its arguments.
 */
function serveMeeting(answers: Record<string, Answer> = {}) {
    invoke.mockImplementation(
        async (command: string, args?: Record<string, unknown>) => {
            const answer = answers[command];
            if (answer) return answer(args);
            if (command === "get_meeting") return MEETING;
            if (command === "list_meeting_tasks") return [];
            return { ...MEETING, ...args };
        },
    );
}

function renderPage(path: string) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Toaster toastManager={toast}>
                <ArchiveProvider>
                    <Routes>
                        <Route
                            path="/meetings"
                            element={<MeetingsListRoute />}
                        />
                        <Route
                            path="/meetings/:id"
                            element={<MeetingEditorPage />}
                        />
                    </Routes>
                </ArchiveProvider>
            </Toaster>
        </MemoryRouter>,
    );
}

function updates() {
    return invoke.mock.calls.filter(
        ([command]) => command === "update_meeting",
    );
}

beforeEach(() => {
    invoke.mockReset();
});

describe("MeetingEditorPage", () => {
    it("says that a meeting does not exist and links back to the list", async () => {
        invoke.mockResolvedValue(null);
        const user = userEvent.setup();
        renderPage("/meetings/42");

        expect(
            await screen.findByText(/This meeting doesn't exist/),
        ).toBeInTheDocument();
        expect(invoke).toHaveBeenCalledWith("get_meeting", { id: 42 });

        await user.click(
            screen.getByRole("link", { name: "Back to Meetings" }),
        );
        expect(screen.getByText("Meetings list")).toBeInTheDocument();
    });

    it("shows an error with a Retry button when the meeting cannot be loaded", async () => {
        let loads = 0;
        serveMeeting({
            get_meeting: () => {
                loads += 1;
                if (loads === 1) throw "database is locked";
                return MEETING;
            },
        });
        const user = userEvent.setup();
        renderPage("/meetings/42");

        await user.click(await screen.findByRole("button", { name: "Retry" }));

        expect(
            await screen.findByRole("textbox", { name: "Meeting name" }),
        ).toHaveValue("Weekly sync");
    });

    it("shows Untitled meeting in the breadcrumb when the name is empty", async () => {
        serveMeeting();
        const user = userEvent.setup();
        renderPage("/meetings/42");

        await user.clear(
            await screen.findByRole("textbox", { name: "Meeting name" }),
        );

        expect(
            screen.getByRole("navigation", { name: "breadcrumb" }),
        ).toHaveTextContent("Untitled meeting");
    });

    it("keeps the last complete date when the date field is cleared", async () => {
        serveMeeting();
        renderPage("/meetings/42");
        const date = await screen.findByLabelText("Meeting date");

        fireEvent.change(date, { target: { value: "" } });
        fireEvent.change(
            screen.getByRole("textbox", { name: "Meeting name" }),
            {
                target: { value: "Renamed" },
            },
        );

        await waitFor(
            () =>
                expect(invoke).toHaveBeenCalledWith(
                    "update_meeting",
                    expect.objectContaining({
                        name: "Renamed",
                        date: "2026-09-24",
                    }),
                ),
            { timeout: 2000 },
        );
        expect(date).toHaveValue("2026-09-24");
        expect(
            updates().every(([, args]) => (args as Meeting).date !== ""),
        ).toBe(true);
    });

    it("keeps the last complete date when the date field has an invalid value", async () => {
        serveMeeting();
        renderPage("/meetings/42");
        const date = await screen.findByLabelText("Meeting date");

        fireEvent.change(date, { target: { value: "20261-09-24" } });
        fireEvent.change(
            screen.getByRole("textbox", { name: "Meeting name" }),
            {
                target: { value: "Renamed" },
            },
        );

        await waitFor(
            () =>
                expect(invoke).toHaveBeenCalledWith(
                    "update_meeting",
                    expect.objectContaining({
                        name: "Renamed",
                        date: "2026-09-24",
                    }),
                ),
            { timeout: 2000 },
        );
        expect(
            updates().every(
                ([, args]) => (args as Meeting).date !== "20261-09-24",
            ),
        ).toBe(true);
    });

    it("carries the stored notes along unchanged when the name changes", async () => {
        serveMeeting({
            get_meeting: () => ({ ...MEETING, notes: "- [ ] Send notes\n" }),
        });
        const user = userEvent.setup();
        renderPage("/meetings/42");

        await user.type(
            await screen.findByRole("textbox", { name: "Meeting name" }),
            "!",
        );

        await waitFor(
            () =>
                expect(invoke).toHaveBeenCalledWith("update_meeting", {
                    id: 42,
                    name: "Weekly sync!",
                    date: "2026-09-24",
                    notes: "- [ ] Send notes\n",
                }),
            { timeout: 2000 },
        );
        expect(await screen.findByText("Saved")).toBeInTheDocument();
    });

    it("archives once when Archive is clicked twice quickly", async () => {
        let resolveArchive: (() => void) | undefined;
        serveMeeting({
            archive_meeting: () =>
                new Promise<void>((resolve) => {
                    resolveArchive = resolve;
                }),
        });
        const user = userEvent.setup();
        renderPage("/meetings/42");
        const archiveButton = await screen.findByRole("button", {
            name: "Archive",
        });

        await user.click(archiveButton);
        await user.click(archiveButton);

        expect(
            invoke.mock.calls.filter(
                ([command]) => command === "archive_meeting",
            ),
        ).toHaveLength(1);
        expect(invoke).toHaveBeenCalledWith("archive_meeting", { id: 42 });

        resolveArchive?.();

        expect(await screen.findByText("Meetings list")).toBeInTheDocument();
    });

    it("shows a toast naming the meeting with the name that the user typed", async () => {
        serveMeeting({ archive_meeting: () => null });
        const user = userEvent.setup();
        renderPage("/meetings/42");

        fireEvent.change(
            await screen.findByRole("textbox", { name: "Meeting name" }),
            { target: { value: "Retro" } },
        );
        await user.click(screen.getByRole("button", { name: "Archive" }));

        expect(await screen.findByText("Meetings list")).toBeInTheDocument();
        expect(
            within(notifications()).getByText('Archived "Retro".'),
        ).toBeInTheDocument();
    });
});
