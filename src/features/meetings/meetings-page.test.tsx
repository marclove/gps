import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { formatMeetingDate } from "@/lib/dates";
import { MeetingsPage } from "./meetings-page";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function renderPage() {
    render(
        <MemoryRouter>
            <MeetingsPage />
        </MemoryRouter>,
    );
}

function summary(id: number, name: string, date: string) {
    return { id, name, date, updatedAt: "2026-09-24T17:00:00.000Z" };
}

beforeEach(() => {
    invoke.mockReset();
});

describe("MeetingsPage", () => {
    it("shows the page title Meetings", async () => {
        invoke.mockResolvedValue([]);
        renderPage();

        expect(
            screen.getByRole("heading", { level: 1, name: "Meetings" }),
        ).toBeInTheDocument();
        await screen.findByText("No meetings yet");
    });

    it("says that there are no meetings", async () => {
        invoke.mockResolvedValue([]);
        renderPage();

        expect(await screen.findByText("No meetings yet")).toBeInTheDocument();
    });

    it("lists meetings in the order the backend returns, with name and date", async () => {
        invoke.mockResolvedValue([
            summary(2, "Weekly sync", "2026-09-24"),
            summary(1, "Kickoff", "2026-09-18"),
        ]);
        renderPage();

        // Wait for the meetings to load, then read only the meeting links: the
        // breadcrumb's current page is also given the accessible role "link".
        await screen.findByText("Weekly sync");
        const links = screen
            .getAllByRole("link")
            .filter((link) => link.tagName === "A");
        expect(links).toHaveLength(2);
        expect(links[0]).toHaveTextContent("Weekly sync");
        expect(links[0]).toHaveTextContent(formatMeetingDate("2026-09-24"));
        expect(links[1]).toHaveTextContent("Kickoff");
    });

    it("shows a meeting with an empty name as Untitled meeting", async () => {
        invoke.mockResolvedValue([summary(1, "", "2026-09-24")]);
        renderPage();

        expect(
            await screen.findByRole("link", { name: /Untitled meeting/ }),
        ).toBeInTheDocument();
    });

    it("shows an error with a Retry button when the list cannot be loaded", async () => {
        invoke.mockRejectedValueOnce("database is locked");
        invoke.mockResolvedValueOnce([summary(1, "Kickoff", "2026-09-18")]);
        const user = userEvent.setup();
        renderPage();

        expect(
            await screen.findByText("Couldn't load meetings"),
        ).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Retry" }));

        expect(
            await screen.findByRole("link", { name: /Kickoff/ }),
        ).toBeInTheDocument();
    });

    it("reports a failed creation and lets the user try again", async () => {
        invoke.mockImplementation(async (command: string) => {
            if (command === "list_meetings") return [];
            throw "disk I/O error";
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", { name: "New note" }),
        );

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Couldn't create a note",
        );
        expect(screen.getByRole("button", { name: "New note" })).toBeEnabled();
    });

    it("creates only one meeting when New note is clicked twice", async () => {
        invoke.mockImplementation((command: string) =>
            command === "list_meetings"
                ? Promise.resolve([])
                : new Promise(() => {}),
        );
        const user = userEvent.setup();
        renderPage();
        const button = await screen.findByRole("button", { name: "New note" });

        await user.click(button);
        await user.click(button);

        expect(
            invoke.mock.calls.filter(
                ([command]) => command === "create_meeting",
            ),
        ).toHaveLength(1);
    });

    it("hides the error after a failed archive when the next archive succeeds", async () => {
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(2, "Weekly sync", "2026-09-24"),
                    summary(1, "Kickoff", "2026-09-18"),
                ]);
            }
            if (command === "archive_meeting") {
                return Promise.reject("database is locked");
            }
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();
        const archiveButton = await screen.findByRole("button", {
            name: 'Archive "Weekly sync"',
        });

        await user.click(archiveButton);

        expect(
            await screen.findByText("Couldn't archive the meeting. Try again."),
        ).toBeInTheDocument();

        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(2, "Weekly sync", "2026-09-24"),
                    summary(1, "Kickoff", "2026-09-18"),
                ]);
            }
            if (command === "archive_meeting") {
                return Promise.resolve(null);
            }
            return Promise.resolve(null);
        });

        await user.click(
            screen.getByRole("button", { name: 'Archive "Weekly sync"' }),
        );

        expect(
            await screen.findByText('Archived "Weekly sync".'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Couldn't archive the meeting. Try again."),
        ).toBeNull();
    });

    it("restores only once when Undo is clicked twice quickly", async () => {
        let resolveUnarchive: (() => void) | undefined;
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([summary(1, "Kickoff", "2026-09-18")]);
            }
            if (command === "archive_meeting") {
                return Promise.resolve(null);
            }
            if (command === "unarchive_meeting") {
                return new Promise<void>((resolve) => {
                    resolveUnarchive = resolve;
                });
            }
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();
        await user.click(
            await screen.findByRole("button", { name: 'Archive "Kickoff"' }),
        );
        const undoButton = await screen.findByRole("button", { name: "Undo" });

        await user.click(undoButton);
        await user.click(undoButton);

        expect(
            invoke.mock.calls.filter(
                ([command]) => command === "unarchive_meeting",
            ),
        ).toHaveLength(1);

        resolveUnarchive?.();

        await waitFor(() =>
            expect(screen.queryByText('Archived "Kickoff".')).toBeNull(),
        );
    });

    it("hides the restore error when another meeting is archived", async () => {
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(2, "Kickoff", "2026-09-24"),
                    summary(1, "Standup", "2026-09-18"),
                ]);
            }
            if (command === "archive_meeting") {
                return Promise.resolve(null);
            }
            if (command === "unarchive_meeting") {
                return Promise.reject("database is locked");
            }
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", { name: 'Archive "Standup"' }),
        );
        await user.click(await screen.findByRole("button", { name: "Undo" }));

        expect(
            await screen.findByText("Couldn't restore the meeting. Try again."),
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: 'Archive "Kickoff"' }),
        );

        expect(
            await screen.findByText('Archived "Kickoff".'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Couldn't restore the meeting. Try again."),
        ).toBeNull();
    });

    it("keeps the newer archive notice when an older restore resolves after another archive", async () => {
        let resolveUnarchive: (() => void) | undefined;
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(2, "Kickoff", "2026-09-24"),
                    summary(1, "Standup", "2026-09-18"),
                ]);
            }
            if (command === "archive_meeting") {
                return Promise.resolve(null);
            }
            if (command === "unarchive_meeting") {
                return new Promise<void>((resolve) => {
                    resolveUnarchive = resolve;
                });
            }
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", { name: 'Archive "Standup"' }),
        );
        await user.click(await screen.findByRole("button", { name: "Undo" }));
        await user.click(
            screen.getByRole("button", { name: 'Archive "Kickoff"' }),
        );

        expect(
            await screen.findByText('Archived "Kickoff".'),
        ).toBeInTheDocument();

        resolveUnarchive?.();

        // Give the resolved restore a chance to run its `then`/`catch` handlers.
        await waitFor(() => {
            expect(
                invoke.mock.calls.filter(
                    ([command]) => command === "list_meetings",
                ).length,
            ).toBeGreaterThan(1);
        });
        expect(screen.getByText('Archived "Kickoff".')).toBeInTheDocument();
        expect(screen.queryByText('Archived "Standup".')).toBeNull();
        expect(
            screen.queryByText("Couldn't restore the meeting. Try again."),
        ).toBeNull();
        expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    });

    it("shows the archive notice that the location state gives", async () => {
        invoke.mockResolvedValue([]);
        render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: "/meetings",
                        state: { archived: { id: 7, name: "Standup" } },
                    },
                ]}
            >
                <MeetingsPage />
            </MemoryRouter>,
        );

        expect(
            await screen.findByText('Archived "Standup".'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Undo" }),
        ).toBeInTheDocument();
    });

    it("keeps the newer archive notice and shows no restore error when an older restore fails after another archive", async () => {
        let rejectUnarchive: ((reason: unknown) => void) | undefined;
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(2, "Kickoff", "2026-09-24"),
                    summary(1, "Standup", "2026-09-18"),
                ]);
            }
            if (command === "archive_meeting") {
                return Promise.resolve(null);
            }
            if (command === "unarchive_meeting") {
                return new Promise<void>((_resolve, reject) => {
                    rejectUnarchive = reject;
                });
            }
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", { name: 'Archive "Standup"' }),
        );
        await user.click(await screen.findByRole("button", { name: "Undo" }));
        await user.click(
            screen.getByRole("button", { name: 'Archive "Kickoff"' }),
        );

        expect(
            await screen.findByText('Archived "Kickoff".'),
        ).toBeInTheDocument();

        rejectUnarchive?.("database is locked");

        // Give the rejected restore a chance to run its `catch` handler.
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
        });
        expect(screen.getByText('Archived "Kickoff".')).toBeInTheDocument();
        expect(screen.queryByText('Archived "Standup".')).toBeNull();
        expect(
            screen.queryByText("Couldn't restore the meeting. Try again."),
        ).toBeNull();
    });
});
