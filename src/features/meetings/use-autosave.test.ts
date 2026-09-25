import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "./use-autosave";

type Draft = { text: string };

/** A save function whose calls stay in progress until the test settles them. */
function controlledSave() {
    const calls: { value: Draft; resolve: () => void; reject: () => void }[] =
        [];
    const save = vi.fn(
        (value: Draft) =>
            new Promise<void>((resolve, reject) => {
                calls.push({
                    value,
                    resolve,
                    reject: () => reject(new Error("failed")),
                });
            }),
    );
    return { save, calls };
}

function renderAutosave(save: (value: Draft) => Promise<unknown>) {
    return renderHook(({ value }) => useAutosave(value, save, 500), {
        initialProps: { value: { text: "initial" } },
    });
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useAutosave", () => {
    it("does not save the first value", () => {
        const { save } = controlledSave();
        const { result } = renderAutosave(save);

        act(() => vi.advanceTimersByTime(1000));

        expect(save).not.toHaveBeenCalled();
        expect(result.current.status).toBe("idle");
    });

    it("saves once, with the latest value, after the user pauses", async () => {
        const { save, calls } = controlledSave();
        const { result, rerender } = renderAutosave(save);

        rerender({ value: { text: "a" } });
        act(() => vi.advanceTimersByTime(300));
        rerender({ value: { text: "ab" } });
        act(() => vi.advanceTimersByTime(300));
        expect(save).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(200));
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenLastCalledWith({ text: "ab" });
        expect(result.current.status).toBe("saving");

        await act(async () => calls[0].resolve());
        expect(result.current.status).toBe("saved");
    });

    it("runs one save at a time and then saves changes made during it", async () => {
        const { save, calls } = controlledSave();
        const { result, rerender } = renderAutosave(save);

        rerender({ value: { text: "first" } });
        act(() => vi.advanceTimersByTime(500));
        rerender({ value: { text: "second" } });
        act(() => vi.advanceTimersByTime(500));
        expect(save).toHaveBeenCalledTimes(1);

        await act(async () => calls[0].resolve());
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith({ text: "second" });
        expect(result.current.status).toBe("saving");

        await act(async () => calls[1].resolve());
        expect(result.current.status).toBe("saved");
    });

    it("reports a failed save, keeps the change, and saves it again on retry", async () => {
        const { save, calls } = controlledSave();
        const { result, rerender } = renderAutosave(save);

        rerender({ value: { text: "unsaved" } });
        act(() => vi.advanceTimersByTime(500));
        await act(async () => calls[0].reject());
        expect(result.current.status).toBe("error");

        act(() => result.current.retry());
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith({ text: "unsaved" });
        await act(async () => calls[1].resolve());
        expect(result.current.status).toBe("saved");
    });

    it("tries again on the next change after a failed save", async () => {
        const { save, calls } = controlledSave();
        const { rerender } = renderAutosave(save);

        rerender({ value: { text: "a" } });
        act(() => vi.advanceTimersByTime(500));
        await act(async () => calls[0].reject());

        rerender({ value: { text: "ab" } });
        act(() => vi.advanceTimersByTime(500));
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith({ text: "ab" });
    });

    it("saves a waiting change immediately on unmount", () => {
        const { save } = controlledSave();
        const { rerender, unmount } = renderAutosave(save);

        rerender({ value: { text: "leaving" } });
        unmount();

        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenLastCalledWith({ text: "leaving" });
    });

    it("saves a change made during a save after unmount, when that save finishes", async () => {
        const { save, calls } = controlledSave();
        const { rerender, unmount } = renderAutosave(save);

        rerender({ value: { text: "first" } });
        act(() => vi.advanceTimersByTime(500));
        rerender({ value: { text: "second" } });
        unmount();
        expect(save).toHaveBeenCalledTimes(1);

        await act(async () => calls[0].resolve());
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith({ text: "second" });
    });

    it("does not save on unmount when nothing changed", () => {
        const { save } = controlledSave();
        const { unmount } = renderAutosave(save);

        unmount();

        expect(save).not.toHaveBeenCalled();
    });
});
