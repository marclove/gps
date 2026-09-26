import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import {
    ArchiveProvider,
    useArchive,
    type ArchiveApi,
} from "./archive-provider";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
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

/** Shows the archive state so a test can read it, and hands the archive action to the test. */
function Harness({ onReady }: { onReady: (api: ArchiveApi) => void }) {
    const api = useArchive();
    onReady(api);
    return (
        <div>
            <span data-testid="version">{api.version}</span>
            <span data-testid="restored">{api.restored?.id ?? "none"}</span>
        </div>
    );
}

/** Renders the provider tree the archive action needs: the toast provider, then the archive provider. */
function renderHarness() {
    const ref: { current: ArchiveApi | null } = { current: null };
    render(
        <Toaster toastManager={toast}>
            <ArchiveProvider>
                <Harness
                    onReady={(api) => {
                        ref.current = api;
                    }}
                />
            </ArchiveProvider>
        </Toaster>,
    );
    return {
        archive: (meeting: { id: number; name: string }) =>
            ref.current!.archive(meeting),
        version: () => Number(screen.getByTestId("version").textContent),
        restoredId: () => screen.getByTestId("restored").textContent,
    };
}

/** The region that holds the toasts. */
function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

/** The Undo button of the archive toast. */
function undoButton() {
    return within(notifications()).getByRole("button", { name: "Undo" });
}

describe("ArchiveProvider", () => {
    it("shows a toast with the name and Undo after an archive", async () => {
        const harness = renderHarness();

        await act(() => harness.archive({ id: 1, name: "Standup" }));

        expect(invoke).toHaveBeenCalledWith("archive_meeting", { id: 1 });
        expect(
            within(notifications()).getByText('Archived "Standup".'),
        ).toBeInTheDocument();
        expect(undoButton()).toBeInTheDocument();
    });

    it("rejects and shows no toast when archiving fails", async () => {
        invoke.mockImplementation((command: string) =>
            command === "archive_meeting"
                ? Promise.reject(new Error("boom"))
                : Promise.resolve(null),
        );
        const harness = renderHarness();

        await expect(
            act(() => harness.archive({ id: 1, name: "Standup" })),
        ).rejects.toThrow("boom");

        expect(
            screen.queryByText('Archived "Standup".'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument();
    });

    it("closes the earlier toast when another meeting is archived", async () => {
        const harness = renderHarness();

        await act(() => harness.archive({ id: 1, name: "Standup" }));
        await act(() => harness.archive({ id: 2, name: "Kickoff" }));

        const toasts = notifications();
        expect(
            within(toasts).getByText('Archived "Kickoff".'),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByText('Archived "Standup".'),
        ).not.toBeInTheDocument();
        expect(
            within(toasts).getAllByRole("button", { name: "Undo" }),
        ).toHaveLength(1);
    });

    it("restores once when Undo is clicked twice quickly", async () => {
        const held = heldPromise();
        invoke.mockImplementation((command: string) =>
            command === "unarchive_meeting"
                ? held.promise
                : Promise.resolve(null),
        );
        const harness = renderHarness();
        await act(() => harness.archive({ id: 1, name: "Standup" }));

        const button = undoButton();
        fireEvent.click(button);
        fireEvent.click(button);

        expect(
            invoke.mock.calls.filter(
                ([command]) => command === "unarchive_meeting",
            ),
        ).toHaveLength(1);

        await act(async () => {
            held.resolve();
            await held.promise;
        });
        await waitFor(() =>
            expect(
                screen.queryByText('Archived "Standup".'),
            ).not.toBeInTheDocument(),
        );
    });

    it("changes the toast to an error and keeps Undo when restoring fails", async () => {
        invoke.mockImplementation((command: string) =>
            command === "unarchive_meeting"
                ? Promise.reject(new Error("boom"))
                : Promise.resolve(null),
        );
        const harness = renderHarness();
        await act(() => harness.archive({ id: 1, name: "Standup" }));

        await act(() => fireEvent.click(undoButton()));

        const toasts = notifications();
        expect(
            await within(toasts).findByText(
                "Couldn't restore the meeting. Try again.",
            ),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByText('Archived "Standup".'),
        ).not.toBeInTheDocument();
        expect(
            within(toasts).getByRole("button", { name: "Undo" }),
        ).toBeInTheDocument();
    });

    it("increments version after an archive and after a restore", async () => {
        const harness = renderHarness();
        expect(harness.version()).toBe(0);

        await act(() => harness.archive({ id: 1, name: "Standup" }));
        expect(harness.version()).toBe(1);

        await act(() => fireEvent.click(undoButton()));
        await waitFor(() => expect(harness.version()).toBe(2));
    });

    it("does not set restored or touch the newer toast when an older restore finishes late", async () => {
        const held = heldPromise();
        invoke.mockImplementation((command: string) =>
            command === "unarchive_meeting"
                ? held.promise
                : Promise.resolve(null),
        );
        const harness = renderHarness();
        await act(() => harness.archive({ id: 1, name: "Standup" }));
        await act(() => fireEvent.click(undoButton()));

        await act(() => harness.archive({ id: 2, name: "Kickoff" }));

        const toasts = notifications();
        expect(
            within(toasts).getByText('Archived "Kickoff".'),
        ).toBeInTheDocument();
        expect(harness.version()).toBe(2);

        await act(async () => {
            held.resolve();
            await held.promise;
        });

        expect(
            within(toasts).getByText('Archived "Kickoff".'),
        ).toBeInTheDocument();
        expect(
            within(toasts).queryByText(
                "Couldn't restore the meeting. Try again.",
            ),
        ).not.toBeInTheDocument();
        expect(harness.restoredId()).toBe("none");
        expect(harness.version()).toBe(3);
    });
});
