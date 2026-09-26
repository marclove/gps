import type { ReactNode } from "react";
import type { ToastManager } from "@base-ui/react/toast";
import {
    Toast,
    ToastAction,
    ToastClose,
    ToastContent,
    ToastPortal,
    ToastProvider,
    ToastTitle,
    ToastViewport,
    toast as defaultToastManager,
    useToastManager,
} from "@/components/ui/toast";

/** Renders one toast for each entry of the toast manager, with its title and buttons. */
function ToastList() {
    const { toasts } = useToastManager();

    return toasts.map((item) => (
        // The archive toast and a failure toast can be open together. The stack always
        // shows every toast in full, one above the other, so the user can read each
        // message and reach each button without a hover or focus. Base UI's default
        // shows only the frontmost toast until the pointer or the focus expands the stack.
        <Toast
            key={item.id}
            toast={item}
            className="h-(--toast-height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]"
        >
            <ToastContent className="data-behind:opacity-100">
                {/* The title takes the free width, so the buttons sit at the right side. */}
                <ToastTitle className="flex-1" />
                <ToastAction />
                {/* Base UI hides the close button from screen readers until the stack
                    expands. The stack always shows every toast, so the button stays
                    available. */}
                <ToastClose aria-hidden={false} />
            </ToastContent>
        </Toast>
    ));
}

/**
 * Shows the toasts of the application.
 *
 * Wrap the application with `Toaster` once, outside its routes, so a toast stays open
 * when the user opens another page. The toasts sit in a region a screen reader
 * announces as "Notifications", at the bottom right of the window.
 */
export function Toaster({
    children,
    toastManager = defaultToastManager,
}: {
    children?: ReactNode;
    toastManager?: ToastManager;
}) {
    return (
        <ToastProvider toastManager={toastManager}>
            {children}
            <ToastPortal>
                <ToastViewport aria-label="Notifications">
                    <ToastList />
                </ToastViewport>
            </ToastPortal>
        </ToastProvider>
    );
}
