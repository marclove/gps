import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { actionItemName, type Task } from "@/lib/tasks";

/**
 * One action item in the list of the action items panel. `inputRef` gets the text
 * field of the item, so that the panel can move the focus to it. `completed` sets
 * the checkbox, and `onCompletedChange` gets the new value when the user clicks it.
 */
export function ActionItemRow({
    task,
    completed,
    onCompletedChange,
    inputRef,
}: {
    task: Task;
    completed: boolean;
    onCompletedChange: (completed: boolean) => void;
    inputRef: (element: HTMLInputElement | null) => void;
}) {
    const text = task.description;
    return (
        <li className="flex items-center gap-2">
            <Checkbox
                aria-label={`Complete "${actionItemName(text)}"`}
                checked={completed}
                onCheckedChange={(checked) => onCompletedChange(checked)}
            />
            <Input
                ref={inputRef}
                aria-label="Action item"
                readOnly
                value={text}
                className={cn(
                    "border-transparent shadow-none",
                    completed ? "text-muted-foreground" : "text-foreground",
                )}
            />
        </li>
    );
}
