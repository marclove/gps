import type { ReactNode } from "react";
import { FIELD_LABEL_CLASSES } from "@/components/form-field-classes";
import { Button } from "@/components/ui/button";

/**
 * A field of the meeting details sidebar: a label above a select box. If the choices cannot
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
        <div className="flex flex-col items-start gap-1.5">
            {failed ? (
                <span className={FIELD_LABEL_CLASSES}>{label}</span>
            ) : (
                <label htmlFor={selectId} className={FIELD_LABEL_CLASSES}>
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
