import { useEffect, useRef, useState } from "react";
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
 */
export function ActionItemRow({
    task,
    completed,
    onCompletedChange,
    onSaveResult,
    inputRef,
}: {
    task: Task;
    completed: boolean;
    onCompletedChange: (completed: boolean) => void;
    onSaveResult: (ok: boolean) => void;
    inputRef: (element: HTMLInputElement | null) => void;
}) {
    // The row owns the text after the first render, so that an answer from the backend never replaces what the user typed.
    const [text, setText] = useState(task.description);
    const save = (description: string) =>
        updateTaskDescription(task.id, description);
    const { status } = useAutosave(text, save);

    // Report each change of the status once, not again for each new callback from the panel.
    const onSaveResultRef = useRef(onSaveResult);
    useEffect(() => {
        onSaveResultRef.current = onSaveResult;
    }, [onSaveResult]);
    useEffect(() => {
        if (status === "saved") onSaveResultRef.current(true);
        else if (status === "error") onSaveResultRef.current(false);
    }, [status]);

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
                value={text}
                onChange={(event) => setText(event.target.value)}
                className={cn(
                    "border-transparent shadow-none",
                    completed ? "text-muted-foreground" : "text-foreground",
                )}
            />
        </li>
    );
}
