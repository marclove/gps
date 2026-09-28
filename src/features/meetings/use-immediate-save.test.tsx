import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
    FailureToastContext,
    type FailureToastApi,
} from "@/components/use-failure-toast";
import { useImmediateSave } from "./use-immediate-save";

const FAILURE = "Couldn't save. Try again.";

type Pending = {
    value: string;
    resolve: (result: string) => void;
    reject: (reason: unknown) => void;
};

let toastApi: {
    show: Mock<FailureToastApi["show"]>;
    clear: Mock<FailureToastApi["clear"]>;
};
let pending: Pending[];
let onSaved: Mock<(result: string) => void>;

function wrapper({ children }: { children: ReactNode }) {
    return (
        <FailureToastContext.Provider value={toastApi}>
            {children}
        </FailureToastContext.Provider>
    );
}

/** Renders the hook with a save that ends only when the test resolves or rejects it. */
function renderSave(initial = "a") {
    return renderHook(
        () =>
            useImmediateSave({
                initial,
                save: (value) =>
                    new Promise<string>((resolve, reject) => {
                        pending.push({ value, resolve, reject });
                    }),
                failureText: FAILURE,
                onSaved,
            }),
        { wrapper },
    );
}

beforeEach(() => {
    toastApi = { show: vi.fn(), clear: vi.fn() };
    pending = [];
    onSaved = vi.fn();
});

describe("useImmediateSave", () => {
    it("shows a choice at once and gives the result to onSaved when it is saved", async () => {
        const { result } = renderSave();

        let done: Promise<void> = Promise.resolve();
        act(() => {
            done = result.current.choose("b");
        });
        expect(result.current.shown).toBe("b");

        await act(async () => {
            pending[0].resolve("saved b");
            await done;
        });

        expect(result.current.shown).toBe("b");
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(onSaved).toHaveBeenCalledWith("saved b");
        expect(toastApi.show).not.toHaveBeenCalled();
    });

    it("goes back to the saved value and shows the failure text when the newest save fails", async () => {
        const { result } = renderSave();

        await act(async () => {
            const done = result.current.choose("b");
            pending[0].reject("database is locked");
            await done;
        });

        expect(result.current.shown).toBe("a");
        expect(onSaved).not.toHaveBeenCalled();
        expect(toastApi.show).toHaveBeenCalledWith(FAILURE);
    });

    it("keeps the newer value when an older save succeeds after it", async () => {
        const { result } = renderSave();
        let first: Promise<void> = Promise.resolve();
        let second: Promise<void> = Promise.resolve();
        act(() => {
            first = result.current.choose("b");
            second = result.current.choose("c");
        });

        await act(async () => {
            pending[1].resolve("saved c");
            await second;
        });
        await act(async () => {
            pending[0].resolve("saved b");
            await first;
        });

        expect(result.current.shown).toBe("c");
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(onSaved).toHaveBeenCalledWith("saved c");
        expect(toastApi.show).not.toHaveBeenCalled();
    });

    it("keeps the newer value without a toast when an older save fails after the newer one succeeded", async () => {
        const { result } = renderSave();
        let first: Promise<void> = Promise.resolve();
        let second: Promise<void> = Promise.resolve();
        act(() => {
            first = result.current.choose("b");
            second = result.current.choose("c");
        });

        await act(async () => {
            pending[1].resolve("saved c");
            await second;
        });
        await act(async () => {
            pending[0].reject("database is locked");
            await first;
        });

        expect(result.current.shown).toBe("c");
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(toastApi.show).not.toHaveBeenCalled();
    });

    it("shows an older value that is saved after the newest save fails", async () => {
        const { result } = renderSave();
        let first: Promise<void> = Promise.resolve();
        let second: Promise<void> = Promise.resolve();
        act(() => {
            first = result.current.choose("b");
            second = result.current.choose("c");
        });

        await act(async () => {
            pending[1].reject("database is locked");
            await second;
        });
        // The newest save failed, so the select box goes back to the value saved last.
        expect(result.current.shown).toBe("a");
        expect(toastApi.show).toHaveBeenCalledWith(FAILURE);

        await act(async () => {
            pending[0].resolve("saved b");
            await first;
        });

        // The database holds the older value, so the select box shows it.
        expect(result.current.shown).toBe("b");
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(onSaved).toHaveBeenCalledWith("saved b");
        // The toast of the newer failure stays open.
        expect(toastApi.clear).not.toHaveBeenCalled();
    });
});
