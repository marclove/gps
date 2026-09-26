import { Input } from "@/components/ui/input";
import type { Task } from "@/lib/tasks";

/**
 * One action item in the list of the action items panel. `inputRef` gets the text
 * field of the item, so that the panel can move the focus to it.
 */
export function ActionItemRow({
    task,
    inputRef,
}: {
    task: Task;
    inputRef: (element: HTMLInputElement | null) => void;
}) {
    return (
        <li className="flex items-center gap-2">
            <Input
                ref={inputRef}
                aria-label="Action item"
                readOnly
                value={task.description}
                className="border-transparent shadow-none"
            />
        </li>
    );
}
