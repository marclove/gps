import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { formatMeetingDate } from "@/lib/dates";
import { DeleteProvider } from "@/components/delete-provider";
import { MeetingsPage } from "./meetings-page";
import { useDelete, type DeleteApi } from "@/components/use-delete";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

/** Calls `onReady` with the delete action, so a test can delete a meeting without a
 *  rendered row, for example while the Meetings page's own list is still loading. */
function DeleteHarness({
    onReady,
}: {
    onReady: (deleteItem: DeleteApi["deleteItem"]) => void;
}) {
    const { deleteItem } = useDelete();
    onReady(deleteItem);
    return null;
}

function renderPage(extra?: ReactNode) {
    render(
        <MemoryRouter>
            <Toaster toastManager={toast}>
                <FailureToastProvider>
                    <DeleteProvider>
                        {extra}
                        <MeetingsPage />
                    </DeleteProvider>
                </FailureToastProvider>
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

    it("closes the failure toast after a failed delete when the next delete succeeds", async () => {
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(2, "Weekly sync", "2026-09-24"),
                    summary(1, "Kickoff", "2026-09-18"),
                ]);
            }
            if (command === "delete_meeting") {
                return Promise.reject("database is locked");
            }
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();
        const deleteButton = await screen.findByRole("button", {
            name: 'Delete "Weekly sync"',
        });

        await user.click(deleteButton);

        expect(
            await within(notifications()).findByText(
                "Couldn't delete the meeting. Try again.",
            ),
        ).toBeInTheDocument();

        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(2, "Weekly sync", "2026-09-24"),
                    summary(1, "Kickoff", "2026-09-18"),
                ]);
            }
            if (command === "delete_meeting") {
                return Promise.resolve(null);
            }
            return Promise.resolve(null);
        });

        await user.click(
            screen.getByRole("button", { name: 'Delete "Weekly sync"' }),
        );

        expect(
            await within(notifications()).findByText('Deleted "Weekly sync".'),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(
                screen.queryByText("Couldn't delete the meeting. Try again."),
            ).toBeNull(),
        );
    });

    it("deletes once when a row's Delete button is clicked twice quickly", async () => {
        let resolveDelete: (() => void) | undefined;
        let deleted = false;
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve(
                    deleted ? [] : [summary(1, "Kickoff", "2026-09-18")],
                );
            }
            if (command === "delete_meeting") {
                return new Promise<void>((resolve) => {
                    resolveDelete = () => {
                        deleted = true;
                        resolve();
                    };
                });
            }
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();
        const deleteButton = await screen.findByRole("button", {
            name: 'Delete "Kickoff"',
        });

        await user.click(deleteButton);
        await user.click(deleteButton);

        expect(
            invoke.mock.calls.filter(
                ([command]) => command === "delete_meeting",
            ),
        ).toHaveLength(1);

        await act(async () => {
            resolveDelete?.();
            await Promise.resolve();
        });

        await waitFor(() =>
            expect(screen.getByText("No meetings yet")).toBeInTheDocument(),
        );
    });

    it("moves focus to the meeting that outlives two deletes started at once", async () => {
        // Deleting A and B while both are still in flight, with B finishing first,
        // must still end with focus on C: the meeting that was after both of them.
        let resolveDeleteA: (() => void) | undefined;
        let resolveDeleteB: (() => void) | undefined;
        const deletedIds = new Set<number>();
        invoke.mockImplementation(
            (command: string, args?: Record<string, unknown>) => {
                if (command === "list_meetings") {
                    return Promise.resolve(
                        [
                            summary(1, "A", "2026-09-18"),
                            summary(2, "B", "2026-09-22"),
                            summary(3, "C", "2026-09-24"),
                        ].filter((meeting) => !deletedIds.has(meeting.id)),
                    );
                }
                if (command === "delete_meeting") {
                    const id = (args as { id: number }).id;
                    return new Promise<void>((resolve) => {
                        const resolveAndMark = () => {
                            deletedIds.add(id);
                            resolve();
                        };
                        if (id === 1) resolveDeleteA = resolveAndMark;
                        if (id === 2) resolveDeleteB = resolveAndMark;
                    });
                }
                return Promise.resolve(null);
            },
        );
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", { name: 'Delete "A"' }),
        );
        await user.click(screen.getByRole("button", { name: 'Delete "B"' }));

        await act(async () => {
            resolveDeleteB?.();
            await Promise.resolve();
        });
        await waitFor(() =>
            expect(
                screen.queryByRole("button", { name: 'Delete "B"' }),
            ).toBeNull(),
        );
        // Moves focus away from where B's own delete left it, so the final check
        // below only passes if resolving A's delete moves focus itself, rather than
        // by coincidence leaving B's now-stale target in place.
        screen.getByRole("button", { name: "New note" }).focus();

        await act(async () => {
            resolveDeleteA?.();
            await Promise.resolve();
        });

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: 'Delete "C"' }),
            ).toHaveFocus(),
        );
    });

    it("moves focus to the delete button of the next meeting after a delete", async () => {
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(3, "Weekly sync", "2026-09-24"),
                    summary(2, "Standup", "2026-09-22"),
                    summary(1, "Kickoff", "2026-09-18"),
                ]);
            }
            if (command === "delete_meeting") return Promise.resolve(null);
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", {
                name: 'Delete "Standup"',
            }),
        );

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: 'Delete "Kickoff"' }),
            ).toHaveFocus(),
        );
    });

    it("moves focus to the meeting before it when the last meeting is deleted", async () => {
        invoke.mockImplementation((command: string) => {
            if (command === "list_meetings") {
                return Promise.resolve([
                    summary(3, "Weekly sync", "2026-09-24"),
                    summary(2, "Standup", "2026-09-22"),
                    summary(1, "Kickoff", "2026-09-18"),
                ]);
            }
            if (command === "delete_meeting") return Promise.resolve(null);
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", {
                name: 'Delete "Kickoff"',
            }),
        );

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: 'Delete "Standup"' }),
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
            if (command === "delete_meeting") return Promise.resolve(null);
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", {
                name: 'Delete "Weekly sync"',
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
            if (command === "delete_meeting") return Promise.resolve(null);
            if (command === "restore_meeting") return Promise.resolve(null);
            return Promise.resolve(null);
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(
            await screen.findByRole("button", { name: 'Delete "Kickoff"' }),
        );
        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        expect(
            await screen.findByRole("link", { name: /Kickoff/ }),
        ).toHaveFocus();
    });

    it("ignores a list response that was in flight when a meeting was deleted", async () => {
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
            if (command === "delete_meeting") return Promise.resolve(null);
            return Promise.resolve(null);
        });
        let deleteFn: DeleteApi["deleteItem"] | undefined;
        renderPage(
            <DeleteHarness
                onReady={(deleteItem) => {
                    deleteFn = deleteItem;
                }}
            />,
        );
        expect(screen.getByText("Loading…")).toBeInTheDocument();

        await act(() => deleteFn!({ kind: "meeting", id: 1, name: "Kickoff" }));
        resolveFirstList?.([summary(1, "Kickoff", "2026-09-18")]);

        await waitFor(() =>
            expect(screen.getByText("No meetings yet")).toBeInTheDocument(),
        );
        expect(screen.queryByRole("link", { name: /Kickoff/ })).toBeNull();
    });
});
