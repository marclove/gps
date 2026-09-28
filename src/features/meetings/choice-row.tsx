import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A row of the meeting details sidebar with a label and a select box. If the choices cannot
 * be loaded, the row shows `errorText` and a Retry button instead of the select box.
 * `selectId` is the identifier of the select box in `children`, which the label refers to.
 */
export function ChoiceRow({
    label,
    selectId,
    failed,
    errorText,
    onRetry,
    children,
}: {
    label: string;
    selectId: string;
    failed: boolean;
    errorText: string;
    onRetry: () => void;
    children: ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-2">
            {failed ? (
                <span className="shrink-0 text-sm font-medium">{label}</span>
            ) : (
                <label
                    htmlFor={selectId}
                    className="shrink-0 text-sm font-medium"
                >
                    {label}
                </label>
            )}
            {failed ? (
                <div className="flex items-center gap-2 text-sm">
                    <p>{errorText}</p>
                    <Button variant="outline" size="sm" onClick={onRetry}>
                        Retry
                    </Button>
                </div>
            ) : (
                children
            )}
        </div>
    );
}
