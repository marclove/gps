import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const invoke = vi.hoisted(() =>
    vi.fn<
        (command: string, args?: Record<string, unknown>) => Promise<unknown>
    >(async () => []),
);

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    // Each test starts with a backend that answers every command with an empty list,
    // so a test that sets its own answers cannot change the answers of a later test.
    invoke.mockReset();
    invoke.mockImplementation(async () => []);
});

/** The region that holds the toasts. */
function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

describe("App", () => {
    it("opens on the Meetings page inside the application shell", () => {
        render(<App />);

        expect(
            within(screen.getByRole("navigation", { name: "Main" })).getByRole(
                "link",
                { name: "Meetings" },
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("navigation", { name: "breadcrumb" }),
        ).toHaveTextContent("Meetings");
    });

    it("closes a failure toast of the editor page when an archive on the Meetings page succeeds", async () => {
        const meetings = [
            {
                id: 1,
                name: "Standup",
                date: "2026-09-22",
                notes: "",
                createdAt: "2026-09-22T10:00:00.000Z",
                updatedAt: "2026-09-22T10:00:00.000Z",
            },
            {
                id: 2,
                name: "Weekly sync",
                date: "2026-09-24",
                notes: "",
                createdAt: "2026-09-24T10:00:00.000Z",
                updatedAt: "2026-09-24T10:00:00.000Z",
            },
        ];
        let failArchive = true;
        invoke.mockImplementation(async (command, args) => {
            switch (command) {
                case "list_meetings":
                    return meetings;
                case "get_meeting":
                    return meetings.find((m) => m.id === args?.id) ?? null;
                case "list_meeting_tasks":
                    return [];
                case "archive_meeting":
                    if (failArchive) throw "database is locked";
                    meetings.splice(
                        meetings.findIndex((m) => m.id === args?.id),
                        1,
                    );
                    return null;
                default:
                    throw `unexpected command ${command}`;
            }
        });
        const user = userEvent.setup();
        render(<App />);

        await user.click(await screen.findByRole("link", { name: /Standup/ }));
        await user.click(
            await screen.findByRole("button", { name: "Archive" }),
        );
        const failure = "Couldn't archive the meeting. Try again.";
        await within(notifications()).findByText(failure);

        failArchive = false;
        await user.click(
            within(screen.getByRole("navigation", { name: "Main" })).getByRole(
                "link",
                { name: "Meetings" },
            ),
        );
        await user.click(
            await screen.findByRole("button", {
                name: 'Archive "Weekly sync"',
            }),
        );

        expect(
            await within(notifications()).findByText('Archived "Weekly sync".'),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(
                within(notifications()).queryByText(failure),
            ).not.toBeInTheDocument(),
        );
    });
});
