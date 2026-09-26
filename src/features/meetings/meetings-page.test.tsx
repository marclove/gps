import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { formatMeetingDate } from "@/lib/dates";
import { ArchiveProvider } from "./archive-provider";
import { MeetingsPage } from "./meetings-page";
import { useArchive, type ArchiveApi } from "./use-archive";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

/** Calls `onReady` with the archive action, so a test can archive a meeting without a
 *  rendered row, for example while the Meetings page's own list is still loading. */
function ArchiveHarness({
    onReady,
}: {
    onReady: (archive: ArchiveApi["archive"]) => void;
}) {
    const { archive } = useArchive();
    onReady(archive);
    return null;
}

function renderPage(extra?: ReactNode) {
    render(
        <MemoryRouter>
            <Toaster toastManager={toast}>
                <ArchiveProvider>
                    {extra}
                    <MeetingsPage />
                </ArchiveProvider>
            </Toaster>
        </MemoryRouter>,
    );
}

/** The region that holds the toasts. */
function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
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
            await within(notifications()).findByText('Archived "Weekly sync".'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Couldn't archive the meeting. Try again."),
        ).toBeNull();
    });

    it("moves focus to the archive button of the next meeting after an archive", async () => {
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(3, "Weekly sync", "2026-09-24"),
                    summary(2, "Standup", "2026-09-22"),
                    summary(1, "Kickoff", "2026-09-18"),
                ]);
            }
            if (command === "archive_meeting") return Promise.resolve(null);
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", {
                name: 'Archive "Standup"',
            }),
        );

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: 'Archive "Kickoff"' }),
            ).toHaveFocus(),
        );
    });

    it("moves focus to the meeting before it when the last meeting is archived", async () => {
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(3, "Weekly sync", "2026-09-24"),
                    summary(2, "Standup", "2026-09-22"),
                    summary(1, "Kickoff", "2026-09-18"),
                ]);
            }
            if (command === "archive_meeting") return Promise.resolve(null);
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", {
                name: 'Archive "Kickoff"',
            }),
        );

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: 'Archive "Standup"' }),
            ).toHaveFocus(),
        );
    });

    it("moves focus to New note when the list becomes empty", async () => {
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(1, "Weekly sync", "2026-09-24"),
                ]);
            }
            if (command === "archive_meeting") return Promise.resolve(null);
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", {
                name: 'Archive "Weekly sync"',
            }),
        );

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: "New note" }),
            ).toHaveFocus(),
        );
    });

    it("moves focus to the restored meeting's link after Undo", async () => {
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([summary(1, "Kickoff", "2026-09-18")]);
            }
            if (command === "archive_meeting") return Promise.resolve(null);
            if (command === "unarchive_meeting") return Promise.resolve(null);
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", { name: 'Archive "Kickoff"' }),
        );
        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        expect(
            await screen.findByRole("link", { name: /Kickoff/ }),
        ).toHaveFocus();
    });

    it("ignores a list response that was in flight when a meeting was archived", async () => {
        let resolveFirstList: ((meetings: unknown[]) => void) | undefined;
        let listCalls = 0;
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                listCalls += 1;
                if (listCalls === 1) {
                    return new Promise((resolve) => {
                        resolveFirstList = resolve;
                    });
                }
                return Promise.resolve([]);
            }
            if (command === "archive_meeting") return Promise.resolve(null);
            return Promise.resolve(null);
        });
        let archiveFn: ArchiveApi["archive"] | undefined;
        renderPage(
            <ArchiveHarness
                onReady={(archive) => {
                    archiveFn = archive;
                }}
            />,
        );
        expect(screen.getByText("Loading…")).toBeInTheDocument();

        await act(() => archiveFn!({ id: 1, name: "Kickoff" }));
        resolveFirstList?.([summary(1, "Kickoff", "2026-09-18")]);

        await waitFor(() =>
            expect(screen.getByText("No meetings yet")).toBeInTheDocument(),
        );
        expect(screen.queryByRole("link", { name: /Kickoff/ })).toBeNull();
    });
});
