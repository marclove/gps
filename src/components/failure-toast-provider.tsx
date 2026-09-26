import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { useToastManager } from "@/components/ui/toast";
import { FailureToastContext } from "./use-failure-toast";

/** How long a failure toast stays open by itself, in milliseconds. */
const TOAST_TIMEOUT = 8000;

/**
 * Gives every page the failure toast, which reports that an action failed and that the
 * user can try it again.
 *
 * This component keeps at most one failure toast open in the window, and the toast
 * stays open when the user opens another page. Place it inside the toast provider.
 */
export function FailureToastProvider({ children }: { children: ReactNode }) {
    const { add, close } = useToastManager();
    // The identifier of the open failure toast, or `null` when none is open.
    const openToastId = useRef<string | null>(null);

    const clear = useCallback(() => {
        if (openToastId.current === null) return;
        close(openToastId.current);
        openToastId.current = null;
    }, [close]);

    const show = useCallback(
        (message: string) => {
            clear();
            // The toast keeps Base UI's default low priority. With high priority, Base UI
            // hides the toast from screen readers and repeats its text in a separate
            // hidden alert, so the message would be on the page twice and the Close
            // button would not be in the accessibility tree.
            openToastId.current = add({
                title: message,
                timeout: TOAST_TIMEOUT,
            });
        },
        [add, clear],
    );

    const api = useMemo(() => ({ show, clear }), [show, clear]);

    return (
        <FailureToastContext.Provider value={api}>
            {children}
        </FailureToastContext.Provider>
    );
}
