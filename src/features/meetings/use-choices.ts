import { useEffect, useState } from "react";
import { useDelete } from "@/components/use-delete";

/** The state of the choices of a select box: loading, failed, or loaded. */
export type ChoicesState<T> =
    { kind: "loading" } | { kind: "error" } | { kind: "loaded"; choices: T };

/**
 * Loads the choices of a select box with `load`. The choices load again when `load`
 * changes, when `retry` is called, and after an item is deleted or restored, for example
 * with Undo while the select box is open. Give a stable `load`, for example from
 * `useCallback`. The hook must be in a `DeleteProvider`.
 */
export function useChoices<T>(load: () => Promise<T>): {
    state: ChoicesState<T>;
    retry: () => void;
} {
    const [state, setState] = useState<ChoicesState<T>>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    // Counts deletes and restores, so the choices load again when an item is deleted or
    // restored.
    const { version: deleteVersion } = useDelete();

    useEffect(() => {
        let current = true;
        load().then(
            (choices) => current && setState({ kind: "loaded", choices }),
            () => current && setState({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [load, attempt, deleteVersion]);

    function retry() {
        setState({ kind: "loading" });
        setAttempt((value) => value + 1);
    }

    return { state, retry };
}
