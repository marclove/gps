import { createContext, useContext } from "react";

/** The actions that open and close the failure toast. */
export type FailureToastApi = {
    /**
     * Shows the message in a failure toast. If a failure toast is open, it closes
     * first, so at most one failure toast is open.
     */
    show: (message: string) => void;
    /** Closes the failure toast, if one is open. */
    clear: () => void;
};

/** Holds the failure toast actions. Provided by `FailureToastProvider`. */
export const FailureToastContext = createContext<FailureToastApi | null>(null);

/**
 * Returns the actions that open and close the failure toast. Must be used inside
 * `FailureToastProvider`.
 */
export function useFailureToast(): FailureToastApi {
    const api = useContext(FailureToastContext);
    if (!api) {
        throw new Error(
            "useFailureToast must be used inside FailureToastProvider",
        );
    }
    return api;
}
