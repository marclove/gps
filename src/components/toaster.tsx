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
        <Toast key={item.id} toast={item}>
            <ToastContent>
                <ToastTitle />
                <ToastAction />
                {/* This application shows at most one toast at a time, so the close
                    button stays reachable without a hover or focus, unlike Base UI's
                    default, which hides it until a stack of several toasts expands. */}
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
