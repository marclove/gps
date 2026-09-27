import { useCallback, useEffect, useRef, useState } from "react";

/** The time to wait after the last change before a save starts, in milliseconds. */
export const AUTOSAVE_DELAY_MS = 500;

/**
 * The state of automatic saving:
 * - `idle`: no change was made yet.
 * - `saving`: a save is in progress.
 * - `saved`: the last save finished and no newer change is waiting.
 * - `error`: the last save failed. The change is kept and is saved on the next change or retry.
 */
export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Saves `value` automatically when it changes.
 *
 * - The save starts `delay` milliseconds after the last change.
 * - Only one save runs at a time. Changes made during a save are saved when it finishes.
 * - The value that the component first gives is not saved.
 * - When the component unmounts, a change that is waiting is saved immediately.
 * - `flush` saves a change that is waiting now. Its promise resolves to `true` when no save is
 *   in progress and no change is waiting, or to `false` when a save fails. It does not
 *   reject.
 *
 * Give a new value (a new object) for each change. Values are compared with `Object.is`.
 */
export function useAutosave<T>(
    value: T,
    save: (value: T) => Promise<unknown>,
    delay: number = AUTOSAVE_DELAY_MS,
): {
    status: AutosaveStatus;
    retry: () => void;
    flush: () => Promise<boolean>;
} {
    const [status, setStatus] = useState<AutosaveStatus>("idle");
    const latest = useRef(value);
    const saveRef = useRef(save);
    const dirty = useRef(false);
    const inFlight = useRef(false);
    // The saves that run now. It is only valid while `inFlight` is true.
    const running = useRef<Promise<boolean>>(Promise.resolve(true));
    const mounted = useRef(true);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        saveRef.current = save;
    }, [save]);

    const runSaves = useCallback(async (): Promise<boolean> => {
        // Changes made while a save is in progress are saved by the next pass of the loop.
        while (dirty.current) {
            dirty.current = false;
            if (mounted.current) setStatus("saving");
            try {
                await saveRef.current(latest.current);
            } catch {
                // Keep the change so that the next change or a retry saves it again.
                dirty.current = true;
                inFlight.current = false;
                if (mounted.current) setStatus("error");
                return false;
            }
        }
        inFlight.current = false;
        if (mounted.current) setStatus("saved");
        return true;
    }, []);

    const flush = useCallback((): Promise<boolean> => {
        clearTimeout(timer.current);
        timer.current = undefined;
        // The saves in progress also save the changes made during them.
        if (inFlight.current) return running.current;
        if (!dirty.current) return Promise.resolve(true);

        inFlight.current = true;
        running.current = runSaves();
        return running.current;
    }, [runSaves]);

    useEffect(() => {
        if (Object.is(value, latest.current)) return;
        latest.current = value;
        dirty.current = true;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), delay);
    }, [value, delay, flush]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            void flush();
        };
    }, [flush]);

    const retry = useCallback(() => {
        void flush();
    }, [flush]);

    return { status, retry, flush };
}
