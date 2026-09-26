import { useEffect, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAutosave } from "@/features/meetings/use-autosave";
import { cn } from "@/lib/utils";
import { actionItemName, updateTaskDescription, type Task } from "@/lib/tasks";

/**
 * One action item in the list of the action items panel. The user can change the
 * text of the item, and the row saves it automatically. `onSaveResult` gets `true`
 * when a save of the text succeeds and `false` when it fails. `inputRef` gets the
 * text field of the item, so that the panel can move the focus to it. `completed`
 * sets the checkbox, and `onCompletedChange` gets the new value when the user clicks it.
 * `onRemove` deletes the item when the user clicks the remove button. It resolves to
 * `true` when the item was deleted and to `false` when the delete failed.
 */
export function ActionItemRow({
    task,
    completed,
    onCompletedChange,
    onSaveResult,
    onRemove,
    inputRef,
}: {
    task: Task;
    completed: boolean;
    onCompletedChange: (completed: boolean) => void;
    onSaveResult: (ok: boolean) => void;
    onRemove: () => Promise<boolean>;
    inputRef: (element: HTMLInputElement | null) => void;
}) {
    // The row owns the text after the first render, so that an answer from the backend never replaces what the user typed.
    const [text, setText] = useState(task.description);
    // The delete that the user started last, until a save finds that it failed.
    const removal = useRef<Promise<boolean> | null>(null);
    // Use the latest callback from the panel when a save finishes.
    const onSaveResultRef = useRef(onSaveResult);
    useEffect(() => {
        onSaveResultRef.current = onSaveResult;
    }, [onSaveResult]);

    const save = async (description: string) => {
        // A change that waits while the item is removed is discarded only when the delete succeeds.
        while (removal.current !== null) {
            const current = removal.current;
            if (await current) return;
            if (removal.current === current) removal.current = null;
        }
        try {
            await updateTaskDescription(task.id, description);
        } catch (error) {
            onSaveResultRef.current(false);
            throw error;
        }
        onSaveResultRef.current(true);
    };
    useAutosave(text, save);

    return (
        <li className="group flex items-center gap-2">
            <Checkbox
                aria-label={`Complete "${actionItemName(text)}"`}
                checked={completed}
                onCheckedChange={(checked) => onCompletedChange(checked)}
            />
            <Input
                ref={inputRef}
                aria-label="Action item"
                value={text}
                onChange={(event) => setText(event.target.value)}
                className={cn(
                    "border-transparent shadow-none",
                    completed ? "text-muted-foreground" : "text-foreground",
                )}
            />
            <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove "${actionItemName(text)}"`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => {
                    removal.current = onRemove();
                }}
            >
                <XIcon />
            </Button>
        </li>
    );
}
