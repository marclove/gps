import { useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";

/**
 * The text field "Add task" above the cards of the Icebox. When the user presses Enter, the
 * field calls `onAdd` with the text without the spaces at its start and end, and becomes empty
 * at once, so the user can type the next task. It keeps the focus. When the text is empty,
 * Enter does nothing. If `onAdd` answers `false`, the task was not added, and the field puts
 * the text back, unless the user has typed a new text since.
 */
export function AddTaskField({
    onAdd,
}: {
    onAdd: (title: string) => Promise<boolean>;
}) {
    const [text, setText] = useState("");

    async function add(event: KeyboardEvent<HTMLInputElement>) {
        // Enter that confirms an input method composition does not add a task. WebKit ends the
        // composition before this keydown, so it sends `isComposing` as false and key code 229.
        if (
            event.key !== "Enter" ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229
        )
            return;
        event.preventDefault();
        const title = text.trim();
        if (title === "") return;
        setText("");
        if (!(await onAdd(title))) {
            setText((current) => (current === "" ? title : current));
        }
    }

    return (
        <Input
            aria-label="Add task"
            placeholder="Add task"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={add}
            className="bg-background dark:bg-input/30"
        />
    );
}
