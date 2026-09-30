import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { useEffect, useRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { DeleteProvider } from "./delete-provider";
import {
    DeleteRefusedError,
    useDelete,
    type DeleteApi,
    type ItemToDelete,
    type RestoredItem,
} from "./use-delete";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

/** Answers every command as the backend does when it succeeds. */
function succeed(command: string) {
    switch (command) {
        case "restore_initiative":
        case "restore_project":
            return Promise.resolve({ status: "restored" });
        case "delete_project":
            return Promise.resolve({ status: "deleted" });
        default:
            return Promise.resolve(null);
    }
}

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(succeed);
});

/** A promise a test can resolve or reject on its own schedule, standing in for a pending command. */
function heldPromise() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<null>((res, rej) => {
        resolve = () => res(null);
        reject = (error: unknown) => rej(error);
    });
    return { promise, resolve, reject };
}

/** Shows the delete state so a test can read it, and hands the delete action to the test. */
function Harness({ onReady }: { onReady: (api: DeleteApi) => void }) {
    const api = useDelete();
    onReady(api);
    return (
        <div>
            <span data-testid="version">{api.version}</span>
            <span data-testid="restored">{api.restored?.id ?? "none"}</span>
            <span data-testid="restored-kind">
                {api.restored?.kind ?? "none"}
            </span>
        </div>
    );
}

/**
 * Reacts to a restored meeting the way the Meetings page does, and ignores a restored
 * item of another kind.
 */
function MeetingRestoreWatcher({
    onRestoredMeeting,
}: {
    onRestoredMeeting: (item: RestoredItem) => void;
}) {
    const { restored } = useDelete();
    const handled = useRef<RestoredItem | null>(restored);
    useEffect(() => {
        if (restored?.kind !== "meeting" || restored === handled.current) {
            return;
        }
        handled.current = restored;
        onRestoredMeeting(restored);
    }, [restored, onRestoredMeeting]);
    return null;
}

/** Renders the provider tree the delete action needs: the toast provider, then the delete provider. */
function renderHarness(extra?: ReactNode) {
    const ref: { current: DeleteApi | null } = { current: null };
    render(
        <Toaster toastManager={toast}>
            <DeleteProvider>
                <Harness
                    onReady={(api) => {
                        ref.current = api;
                    }}
                />
                {extra}
            </DeleteProvider>
        </Toaster>,
    );
    return {
        deleteItem: (item: ItemToDelete) => ref.current!.deleteItem(item),
        version: () => Number(screen.getByTestId("version").textContent),
        restoredId: () => screen.getByTestId("restored").textContent,
        restoredKind: () => screen.getByTestId("restored-kind").textContent,
    };
}

/** The region that holds the toasts. */
function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

/** The Undo button of the delete toast. */
function undoButton() {
    return within(notifications()).getByRole("button", { name: "Undo" });
}

describe("DeleteProvider", () => {
    it("shows a toast with the name and Undo after a delete", async () => {
        const harness = renderHarness();

        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
        );

        expect(invoke).toHaveBeenCalledWith("delete_meeting", { id: 1 });
        expect(
            within(notifications()).getByText('Deleted "Standup".'),
        ).toBeInTheDocument();
        expect(undoButton()).toBeInTheDocument();
    });

    it("rejects and shows no toast when deleting fails", async () => {
        invoke.mockImplementation((command: string) =>
            command === "delete_meeting"
                ? Promise.reject(new Error("boom"))
                : Promise.resolve(null),
        );
        const harness = renderHarness();

        await expect(
            act(() =>
                harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
            ),
        ).rejects.toThrow("boom");

        expect(
            screen.queryByText('Deleted "Standup".'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument();
    });

    it("closes the earlier toast when another meeting is deleted", async () => {
        const harness = renderHarness();

        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
        );
        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 2, name: "Kickoff" }),
        );

        const toasts = notifications();
        expect(
            within(toasts).getByText('Deleted "Kickoff".'),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByText('Deleted "Standup".'),
        ).not.toBeInTheDocument();
        expect(
            within(toasts).getAllByRole("button", { name: "Undo" }),
        ).toHaveLength(1);
    });

    it("restores once when Undo is clicked twice quickly", async () => {
        const held = heldPromise();
        invoke.mockImplementation((command: string) =>
            command === "restore_meeting"
                ? held.promise
                : Promise.resolve(null),
        );
        const harness = renderHarness();
        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
        );

        const button = undoButton();
        fireEvent.click(button);
        fireEvent.click(button);

        expect(
            invoke.mock.calls.filter(
                ([command]) => command === "restore_meeting",
            ),
        ).toHaveLength(1);

        await act(async () => {
            held.resolve();
            await held.promise;
        });
        await waitFor(() =>
            expect(
                screen.queryByText('Deleted "Standup".'),
            ).not.toBeInTheDocument(),
        );
    });

    it("changes the toast to an error and keeps Undo when restoring fails", async () => {
        invoke.mockImplementation((command: string) =>
            command === "restore_meeting"
                ? Promise.reject(new Error("boom"))
                : Promise.resolve(null),
        );
        const harness = renderHarness();
        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
        );

        await act(() => fireEvent.click(undoButton()));

        const toasts = notifications();
        expect(
            await within(toasts).findByText(
                "Couldn't restore the meeting. Try again.",
            ),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByText('Deleted "Standup".'),
        ).not.toBeInTheDocument();
        expect(
            within(toasts).getByRole("button", { name: "Undo" }),
        ).toBeInTheDocument();
    });

    it("increments version after a delete and after a restore", async () => {
        const harness = renderHarness();
        expect(harness.version()).toBe(0);

        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
        );
        expect(harness.version()).toBe(1);

        await act(() => fireEvent.click(undoButton()));
        await waitFor(() => expect(harness.version()).toBe(2));
    });

    it("does not set restored or touch the newer toast when an older restore finishes late", async () => {
        const held = heldPromise();
        invoke.mockImplementation((command: string) =>
            command === "restore_meeting"
                ? held.promise
                : Promise.resolve(null),
        );
        const harness = renderHarness();
        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
        );
        await act(() => fireEvent.click(undoButton()));

        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 2, name: "Kickoff" }),
        );

        const toasts = notifications();
        expect(
            within(toasts).getByText('Deleted "Kickoff".'),
        ).toBeInTheDocument();
        expect(harness.version()).toBe(2);

        await act(async () => {
            held.resolve();
            await held.promise;
        });

        expect(
            within(toasts).getByText('Deleted "Kickoff".'),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByText(
                "Couldn't restore the meeting. Try again.",
            ),
        ).not.toBeInTheDocument();
        expect(harness.restoredId()).toBe("none");
        expect(harness.version()).toBe(3);
    });

    it("deletes and restores an initiative with the initiative commands", async () => {
        const harness = renderHarness();

        await act(() =>
            harness.deleteItem({ kind: "initiative", id: 1, name: "Launch" }),
        );

        expect(invoke).toHaveBeenCalledWith("delete_initiative", { id: 1 });
        expect(
            within(notifications()).getByText('Deleted "Launch".'),
        ).toBeInTheDocument();

        await act(() => fireEvent.click(undoButton()));

        await waitFor(() => expect(harness.restoredId()).toBe("1"));
        expect(harness.restoredKind()).toBe("initiative");
        expect(invoke).toHaveBeenCalledWith("restore_initiative", { id: 1 });
        expect(invoke).not.toHaveBeenCalledWith(
            "delete_meeting",
            expect.anything(),
        );
        expect(invoke).not.toHaveBeenCalledWith(
            "restore_meeting",
            expect.anything(),
        );
    });

    it("names an initiative with an empty name Untitled initiative in the delete toast", async () => {
        const harness = renderHarness();

        await act(() =>
            harness.deleteItem({ kind: "initiative", id: 1, name: "" }),
        );

        expect(
            within(notifications()).getByText('Deleted "Untitled initiative".'),
        ).toBeInTheDocument();
    });

    it("says that the initiative could not be restored", async () => {
        invoke.mockImplementation((command: string) =>
            command === "restore_initiative"
                ? Promise.reject(new Error("boom"))
                : succeed(command),
        );
        const harness = renderHarness();
        await act(() =>
            harness.deleteItem({ kind: "initiative", id: 1, name: "Launch" }),
        );

        await act(() => fireEvent.click(undoButton()));

        const toasts = notifications();
        expect(
            await within(toasts).findByText(
                "Couldn't restore the initiative. Try again.",
            ),
        ).toBeInTheDocument();
        expect(
            within(toasts).getByRole("button", { name: "Undo" }),
        ).toBeInTheDocument();
    });

    it("closes a meeting's toast when an initiative is deleted", async () => {
        const harness = renderHarness();

        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
        );
        await act(() =>
            harness.deleteItem({ kind: "initiative", id: 1, name: "Launch" }),
        );

        const toasts = notifications();
        expect(
            within(toasts).getByText('Deleted "Launch".'),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByText('Deleted "Standup".'),
        ).not.toBeInTheDocument();
        expect(
            within(toasts).getAllByRole("button", { name: "Undo" }),
        ).toHaveLength(1);
    });

    it("closes an initiative's toast when a meeting is deleted", async () => {
        const harness = renderHarness();

        await act(() =>
            harness.deleteItem({ kind: "initiative", id: 1, name: "Launch" }),
        );
        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
        );

        const toasts = notifications();
        expect(
            within(toasts).getByText('Deleted "Standup".'),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByText('Deleted "Launch".'),
        ).not.toBeInTheDocument();
        expect(
            within(toasts).getAllByRole("button", { name: "Undo" }),
        ).toHaveLength(1);
    });

    it("says that the name is taken, without Undo, when another initiative has the name", async () => {
        invoke.mockImplementation((command: string) =>
            command === "restore_initiative"
                ? Promise.resolve({ status: "nameTaken" })
                : succeed(command),
        );
        const harness = renderHarness();
        await act(() =>
            harness.deleteItem({ kind: "initiative", id: 1, name: "Launch" }),
        );
        expect(harness.version()).toBe(1);

        await act(() => fireEvent.click(undoButton()));

        const toasts = notifications();
        expect(
            await within(toasts).findByText(
                'Couldn\'t restore "Launch" because another initiative has that name.',
            ),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByText('Deleted "Launch".'),
        ).not.toBeInTheDocument();
        expect(
            within(toasts).queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument();
        expect(harness.restoredId()).toBe("none");
        expect(harness.version()).toBe(1);
    });

    it("says that the project is deleted, without Undo, when the project of the initiative is deleted", async () => {
        invoke.mockImplementation((command: string) =>
            command === "restore_initiative"
                ? Promise.resolve({ status: "projectDeleted" })
                : succeed(command),
        );
        const harness = renderHarness();
        await act(() =>
            harness.deleteItem({ kind: "initiative", id: 1, name: "Launch" }),
        );

        await act(() => fireEvent.click(undoButton()));

        const toasts = notifications();
        expect(
            await within(toasts).findByText(
                'Couldn\'t restore "Launch" because its project is deleted.',
            ),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument();
        expect(harness.restoredId()).toBe("none");
        expect(harness.version()).toBe(1);
    });

    it("gives the kind with a restored item, so a page for meetings ignores an initiative with the same identifier", async () => {
        const handled: RestoredItem[] = [];
        const harness = renderHarness(
            <MeetingRestoreWatcher
                onRestoredMeeting={(item) => handled.push(item)}
            />,
        );
        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
        );
        await act(() =>
            harness.deleteItem({ kind: "initiative", id: 1, name: "Launch" }),
        );

        await act(() => fireEvent.click(undoButton()));

        await waitFor(() => expect(harness.restoredKind()).toBe("initiative"));
        expect(harness.restoredId()).toBe("1");
        expect(handled).toEqual([]);

        await act(() =>
            harness.deleteItem({ kind: "meeting", id: 1, name: "Standup" }),
        );
        await act(() => fireEvent.click(undoButton()));

        await waitFor(() => expect(harness.restoredKind()).toBe("meeting"));
        expect(handled).toEqual([{ kind: "meeting", id: 1 }]);
    });

    it("deletes and restores a project with the project commands", async () => {
        const harness = renderHarness();

        await act(() =>
            harness.deleteItem({ kind: "project", id: 1, name: "Checkout" }),
        );

        expect(invoke).toHaveBeenCalledWith("delete_project", { id: 1 });
        expect(
            within(notifications()).getByText('Deleted "Checkout".'),
        ).toBeInTheDocument();

        await act(() => fireEvent.click(undoButton()));

        await waitFor(() => expect(harness.restoredKind()).toBe("project"));
        expect(harness.restoredId()).toBe("1");
        expect(invoke).toHaveBeenCalledWith("restore_project", { id: 1 });
    });

    it("rejects with the refusal and shows no toast when a project still has initiatives", async () => {
        invoke.mockImplementation((command: string) =>
            command === "delete_project"
                ? Promise.resolve({ status: "hasInitiatives" })
                : succeed(command),
        );
        const harness = renderHarness();

        let error: unknown;
        await act(() =>
            harness
                .deleteItem({ kind: "project", id: 1, name: "Checkout" })
                .catch((e: unknown) => {
                    error = e;
                }),
        );

        expect(error).toBeInstanceOf(DeleteRefusedError);
        expect((error as Error).message).toBe(
            'Couldn\'t delete "Checkout" because it still has initiatives.',
        );
        expect(
            screen.queryByText('Deleted "Checkout".'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument();
        expect(harness.version()).toBe(0);
    });

    it("says that the name is taken, without Undo, when another project has the name", async () => {
        invoke.mockImplementation((command: string) =>
            command === "restore_project"
                ? Promise.resolve({ status: "nameTaken" })
                : succeed(command),
        );
        const harness = renderHarness();
        await act(() =>
            harness.deleteItem({ kind: "project", id: 1, name: "Checkout" }),
        );

        await act(() => fireEvent.click(undoButton()));

        const toasts = notifications();
        expect(
            await within(toasts).findByText(
                'Couldn\'t restore "Checkout" because another project has that name.',
            ),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument();
        expect(harness.restoredId()).toBe("none");
    });

    it("names a project with an empty name Untitled project in the delete toast", async () => {
        const harness = renderHarness();

        await act(() =>
            harness.deleteItem({ kind: "project", id: 1, name: "" }),
        );

        expect(
            within(notifications()).getByText('Deleted "Untitled project".'),
        ).toBeInTheDocument();
    });
    it("deletes a task and restores it on Undo", async () => {
        const harness = renderHarness();

        await act(() =>
            harness.deleteItem({ kind: "task", id: 1, name: "Send the deck" }),
        );

        expect(invoke).toHaveBeenCalledWith("delete_task", { id: 1 });
        expect(
            within(notifications()).getByText('Deleted "Send the deck".'),
        ).toBeInTheDocument();

        await act(() => fireEvent.click(undoButton()));

        await waitFor(() => expect(harness.restoredKind()).toBe("task"));
        expect(harness.restoredId()).toBe("1");
        expect(invoke).toHaveBeenCalledWith("restore_task", { id: 1 });
    });

    it("says that a project still has tasks", async () => {
        invoke.mockImplementation((command: string) =>
            command === "delete_project"
                ? Promise.resolve({ status: "hasTasks" })
                : succeed(command),
        );
        const harness = renderHarness();

        let error: unknown;
        await act(() =>
            harness
                .deleteItem({ kind: "project", id: 1, name: "Checkout" })
                .catch((e: unknown) => {
                    error = e;
                }),
        );

        expect(error).toBeInstanceOf(DeleteRefusedError);
        expect((error as Error).message).toBe(
            'Couldn\'t delete "Checkout" because it still has tasks.',
        );
        expect(
            screen.queryByText('Deleted "Checkout".'),
        ).not.toBeInTheDocument();
        expect(harness.version()).toBe(0);
    });

    it("keeps Undo when a task cannot be restored", async () => {
        invoke.mockImplementation((command: string) =>
            command === "restore_task"
                ? Promise.reject(new Error("boom"))
                : succeed(command),
        );
        const harness = renderHarness();
        await act(() =>
            harness.deleteItem({ kind: "task", id: 1, name: "Send the deck" }),
        );

        await act(() => fireEvent.click(undoButton()));

        const toasts = notifications();
        expect(
            await within(toasts).findByText(
                "Couldn't restore the task. Try again.",
            ),
        ).toBeInTheDocument();
        expect(
            within(toasts).getByRole("button", { name: "Undo" }),
        ).toBeInTheDocument();
        expect(harness.restoredId()).toBe("none");
    });
});
