import {
    act,
    renderHook,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { useCoveredInitiatives } from "./use-covered-initiatives";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const ADD_FAILED = "Couldn't add the initiative. Try again.";
const REMOVE_FAILED = "Couldn't remove the initiative. Try again.";

type Pending = {
    command: string;
    initiativeId: number;
    resolve: () => void;
    reject: () => void;
};

let pending: Pending[];

beforeEach(() => {
    pending = [];
    invoke.mockReset();
    invoke.mockImplementation(
        (command: string, args: { id: number; initiativeId: number }) =>
            new Promise((resolve, reject) => {
                pending.push({
                    command,
                    initiativeId: args.initiativeId,
                    resolve: () => resolve({}),
                    reject: () => reject(new Error("refused")),
                });
            }),
    );
});

function wrapper({ children }: { children: ReactNode }) {
    return (
        <Toaster toastManager={toast}>
            <FailureToastProvider>{children}</FailureToastProvider>
        </Toaster>
    );
}

function renderCovered(initial: number[] = []) {
    return renderHook(() => useCoveredInitiatives({ meetingId: 3, initial }), {
        wrapper,
    });
}

type Hook = ReturnType<typeof renderCovered>["result"];

/** Starts a toggle and returns the promise that ends with its save. */
function toggle(result: Hook, initiativeId: number, cover: boolean) {
    let done: Promise<void> = Promise.resolve();
    act(() => {
        done = result.current.toggle(initiativeId, cover);
    });
    return done;
}

/** Ends a request with `end` and waits until the hook has handled it. */
async function settle(end: () => void, done: Promise<void>) {
    await act(async () => {
        end();
        await done;
    });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

async function expectToast(text: string) {
    expect(await within(notifications()).findByText(text)).toBeInTheDocument();
}

async function expectNoToast(text: string) {
    await waitFor(() =>
        expect(
            within(notifications()).queryByText(text),
        ).not.toBeInTheDocument(),
    );
}

describe("useCoveredInitiatives", () => {
    it("shows a toggle at once and keeps it when the save succeeds", async () => {
        const { result } = renderCovered([1]);
        expect([...result.current.checked]).toEqual([1]);

        const added = toggle(result, 2, true);
        const removed = toggle(result, 1, false);

        expect(result.current.checked.has(2)).toBe(true);
        expect(result.current.checked.has(1)).toBe(false);
        expect(invoke).toHaveBeenCalledWith("add_meeting_initiative", {
            id: 3,
            initiativeId: 2,
        });
        expect(invoke).toHaveBeenCalledWith("remove_meeting_initiative", {
            id: 3,
            initiativeId: 1,
        });

        await settle(() => pending[0].resolve(), added);
        await settle(() => pending[1].resolve(), removed);

        expect([...result.current.checked]).toEqual([2]);
        expect([...result.current.linked]).toEqual([2]);
    });

    it("goes back and shows the failure toast when an add fails", async () => {
        const { result } = renderCovered();

        const added = toggle(result, 2, true);
        await settle(() => pending[0].reject(), added);

        expect(result.current.checked.has(2)).toBe(false);
        expect(result.current.linked.has(2)).toBe(false);
        await expectToast(ADD_FAILED);
    });

    it("goes back and shows the failure toast when a removal fails", async () => {
        const { result } = renderCovered([1]);

        const removed = toggle(result, 1, false);
        await settle(() => pending[0].reject(), removed);

        expect(result.current.checked.has(1)).toBe(true);
        await expectToast(REMOVE_FAILED);
    });

    it("keeps the last click when two clicks on one initiative end in the other order", async () => {
        const { result } = renderCovered();

        const checked = toggle(result, 2, true);
        const unchecked = toggle(result, 2, false);
        expect(result.current.checked.has(2)).toBe(false);

        await settle(() => pending[1].resolve(), unchecked);
        await settle(() => pending[0].resolve(), checked);

        expect(result.current.checked.has(2)).toBe(false);
        expect(result.current.linked.has(2)).toBe(false);
    });

    it("goes back to the state of the older save when the newer one fails", async () => {
        const { result } = renderCovered();

        const checked = toggle(result, 2, true);
        const unchecked = toggle(result, 2, false);

        // The older save ends first, while the newer one is still in flight, so the
        // checkbox keeps the last click.
        await settle(() => pending[0].resolve(), checked);
        expect(result.current.checked.has(2)).toBe(false);

        await settle(() => pending[1].reject(), unchecked);

        expect(result.current.checked.has(2)).toBe(true);
        await expectToast(REMOVE_FAILED);
    });

    it("ignores an older save that fails after a newer save of the same initiative succeeded", async () => {
        const { result } = renderCovered();

        const checked = toggle(result, 2, true);
        const unchecked = toggle(result, 2, false);
        await settle(() => pending[1].resolve(), unchecked);
        expect(result.current.checked.has(2)).toBe(false);

        await settle(() => pending[0].reject(), checked);

        expect(result.current.checked.has(2)).toBe(false);
        expect(result.current.linked.has(2)).toBe(false);
        expect(
            within(notifications()).queryByText(ADD_FAILED),
        ).not.toBeInTheDocument();
    });

    it("keeps the newer state when an older save fails while a newer save is in flight", async () => {
        const { result } = renderCovered();

        // Three clicks, so that the newest state differs from the state that was saved last.
        const first = toggle(result, 2, true);
        const second = toggle(result, 2, false);
        const third = toggle(result, 2, true);
        await settle(() => pending[0].reject(), first);

        expect(result.current.checked.has(2)).toBe(true);
        await expectToast(ADD_FAILED);

        await settle(() => pending[2].resolve(), third);

        expect(result.current.checked.has(2)).toBe(true);
        await expectNoToast(ADD_FAILED);

        await settle(() => pending[1].resolve(), second);

        expect(result.current.checked.has(2)).toBe(true);
        expect(result.current.linked.has(2)).toBe(true);
    });

    it("keeps the failure toast when a later toggle of another initiative succeeds after the failure", async () => {
        const { result } = renderCovered();

        const other = toggle(result, 1, true);
        const failing = toggle(result, 2, true);
        await settle(() => pending[1].reject(), failing);
        await expectToast(ADD_FAILED);

        await settle(() => pending[0].resolve(), other);

        expect(result.current.checked.has(1)).toBe(true);
        expect(
            within(notifications()).getByText(ADD_FAILED),
        ).toBeInTheDocument();
    });

    it("clears the failure toast when a toggle that started after the failure succeeds", async () => {
        const { result } = renderCovered();

        const failing = toggle(result, 2, true);
        await settle(() => pending[0].reject(), failing);
        await expectToast(ADD_FAILED);

        const other = toggle(result, 1, true);
        await settle(() => pending[1].resolve(), other);

        await expectNoToast(ADD_FAILED);
    });

    it("keeps a removed initiative in linked until its removal is saved", async () => {
        const { result } = renderCovered([1]);

        const removed = toggle(result, 1, false);

        expect(result.current.checked.has(1)).toBe(false);
        expect(result.current.linked.has(1)).toBe(true);

        await settle(() => pending[0].resolve(), removed);

        expect(result.current.linked.has(1)).toBe(false);
    });
});
