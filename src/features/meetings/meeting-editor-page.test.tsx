import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { Meeting } from "@/lib/meetings";
import { MeetingEditorPage } from "./meeting-editor-page";

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

/** Makes the fake backend return MEETING and accept every update. */
function serveMeeting() {
    invoke.mockImplementation(
        async (command: string, args?: Record<string, unknown>) =>
            command === "get_meeting" ? MEETING : { ...MEETING, ...args },
    );
}

function renderPage(path: string) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <SidebarProvider>
                <Routes>
                    <Route path="/meetings" element={<p>Meetings list</p>} />
                    <Route
                        path="/meetings/:id"
                        element={<MeetingEditorPage />}
                    />
                </Routes>
            </SidebarProvider>
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
        invoke.mockRejectedValueOnce("database is locked");
        invoke.mockResolvedValueOnce(MEETING);
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

    it("carries the stored notes along unchanged when the name changes", async () => {
        invoke.mockImplementation(
            async (command: string, args?: Record<string, unknown>) =>
                command === "get_meeting"
                    ? { ...MEETING, notes: "- [ ] Send notes\n" }
                    : { ...MEETING, ...args },
        );
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
});
