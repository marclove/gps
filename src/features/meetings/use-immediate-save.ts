import { useRef, useState } from "react";
import { useFailureToast } from "@/components/use-failure-toast";

/** The value that a select box shows and the function that saves a new choice. */
export type ImmediateSave = {
    /** The value that the select box shows. */
    shown: string;
    /** Shows the value at once and saves it. */
    choose: (value: string) => Promise<void>;
};

/**
 * Keeps the value of a select box that saves each choice at once. `choose` shows the value
 * at once and calls `save`. When a save fails, the select box goes back to the value that was
 * saved last, and a failure toast shows `failureText`.
 *
 * Saves can end in a different order than the user made the choices. An older save that ends
 * after a newer one does not replace the newer value, and its failure is not reported. When
 * all newer saves fail, the value of the older save is the value in the database, so the
 * select box shows it. `onSaved` gets the result of a save only when its value becomes the
 * value that was saved last.
 *
 * `initial` is the saved value when the select box opens. The hook must be in a
 * `FailureToastProvider`.
 */
export function useImmediateSave<T>({
    initial,
    save,
    failureText,
    onSaved,
}: {
    initial: string;
    save: (value: string) => Promise<T>;
    failureText: string;
    onSaved?: (result: T) => void;
}): ImmediateSave {
    const [shown, setShown] = useState(initial);
    // The value that was saved last, with the number of its request.
    const saved = useRef({ request: 0, value: initial });
    // The number of the latest request that saves a choice.
    const latestRequest = useRef(0);
    // The number of the newest request that failed.
    const failedRequest = useRef(0);
    // The numbers of the requests that have not ended.
    const pendingRequests = useRef(new Set<number>());
    const failureToast = useFailureToast();

    async function choose(value: string) {
        const request = ++latestRequest.current;
        pendingRequests.current.add(request);
        setShown(value);
        try {
            const result = await save(value);
            pendingRequests.current.delete(request);
            // An older request that ends after a newer one does not replace the value
            // of the newer one.
            if (request > saved.current.request) {
                saved.current = { request, value };
                // When all newer requests have failed, this value is the value in the
                // database, so the select box shows it.
                const newerPending = [...pendingRequests.current].some(
                    (other) => other > request,
                );
                if (!newerPending) setShown(value);
                onSaved?.(result);
            }
            // The toast of a newer request that failed stays open.
            if (request > failedRequest.current) failureToast.clear();
        } catch {
            pendingRequests.current.delete(request);
            // A newer request has already saved the choice that the select box shows, so
            // this failure has no effect for the user.
            if (request < saved.current.request) return;
            failedRequest.current = Math.max(failedRequest.current, request);
            // An older request that fails does not change the choice, because the user
            // has already made a newer choice.
            if (request === latestRequest.current)
                setShown(saved.current.value);
            failureToast.show(failureText);
        }
    }

    return { shown, choose };
}
