import { Button } from "@/components/ui/button";
import type { AutosaveStatus } from "./use-autosave";

const LABELS: Record<AutosaveStatus, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Couldn't save",
};

/** Shows the state of automatic saving. After a failed save, it also shows a Retry button. */
export function SaveStatus({
    status,
    onRetry,
}: {
    status: AutosaveStatus;
    onRetry: () => void;
}) {
    return (
        <div className="flex items-center gap-2 text-sm">
            <span
                role="status"
                className={
                    status === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                }
            >
                {LABELS[status]}
            </span>
            {status === "error" && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                    Retry
                </Button>
            )}
        </div>
    );
}
