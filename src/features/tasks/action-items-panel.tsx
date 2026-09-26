import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    createTask,
    listMeetingTasks,
    setTaskCompleted,
    type Task,
} from "@/lib/tasks";
import { ActionItemRow } from "./action-item-row";

type LoadState =
    { kind: "loading" } | { kind: "error" } | { kind: "loaded"; tasks: Task[] };

/** The problem that the panel reports, or `null` when there is no problem to report. */
type Message = "add" | "save" | "remove" | null;

const MESSAGE_TEXTS: Record<Exclude<Message, null>, string> = {
    add: "Couldn't add the action item. Try again.",
    save: "Couldn't save the action item. Try again.",
    remove: "Couldn't remove the action item. Try again.",
};

/**
 * The panel that shows the action items of a meeting and lets the user add items.
 * Only the list scrolls. The heading and the field that adds an item stay in place.
 */
export function ActionItemsPanel({ meetingId }: { meetingId: number }) {
    const headingId = useId();
    const [load, setLoad] = useState<LoadState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [newText, setNewText] = useState("");
    const [message, setMessage] = useState<Message>(null);
    // Whether each item is done, by task identifier. An item that is not here uses its stored value.
    const [completed, setCompleted] = useState(new Map<number, boolean>());
    // The number of the latest click on the checkbox of each item, by task identifier.
    const completeClicks = useRef(new Map<number, number>());
    // The value that was saved last for each item, with the number of its click, by task identifier.
    const savedCompleted = useRef(
        new Map<number, { click: number; value: boolean }>(),
    );
    // The text field of each item, by task identifier, so that the focus can move to an item.
    const itemFields = useRef(new Map<number, HTMLInputElement>());

    useEffect(() => {
        let current = true;
        listMeetingTasks(meetingId).then(
            (tasks) => current && setLoad({ kind: "loaded", tasks }),
            () => current && setLoad({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [meetingId, attempt]);

    async function add(event: KeyboardEvent<HTMLInputElement>) {
        // Enter that confirms an input method composition does not add an item.
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        const text = newText.trim();
        if (text === "") return;
        // Clear the field at once, so the user can type the next item while this one saves.
        setNewText("");
        try {
            const task = await createTask(meetingId, text);
            setLoad((current) =>
                current.kind === "loaded"
                    ? { kind: "loaded", tasks: [...current.tasks, task] }
                    : current,
            );
            setMessage(null);
        } catch {
            setMessage("add");
            // Put the text back, unless the user has typed a new text since.
            setNewText((current) => (current === "" ? text : current));
        }
    }

    function isCompleted(task: Task) {
        return completed.get(task.id) ?? task.completedAt !== null;
    }

    async function changeCompleted(task: Task, value: boolean) {
        const click = (completeClicks.current.get(task.id) ?? 0) + 1;
        completeClicks.current.set(task.id, click);
        setCompleted((current) => new Map(current).set(task.id, value));
        try {
            // Do not show the returned task, because a later click may have changed the item since.
            await setTaskCompleted(task.id, value);
            const saved = savedCompleted.current.get(task.id);
            if (saved === undefined || saved.click < click) {
                savedCompleted.current.set(task.id, { click, value });
            }
            setMessage(null);
        } catch {
            setMessage("save");
            // Show the value that was saved last, unless the user has clicked the checkbox again since.
            if (completeClicks.current.get(task.id) === click) {
                const saved =
                    savedCompleted.current.get(task.id)?.value ??
                    task.completedAt !== null;
                setCompleted((current) => new Map(current).set(task.id, saved));
            }
        }
    }

    function itemFieldRef(id: number) {
        return (element: HTMLInputElement | null) => {
            if (element) itemFields.current.set(id, element);
            else itemFields.current.delete(id);
        };
    }

    return (
        <section
            aria-labelledby={headingId}
            className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-l"
        >
            <h2 id={headingId} className="px-4 pt-1 pb-2 text-sm font-medium">
                Action items
            </h2>
            <div className="min-h-0 overflow-y-auto px-2 text-sm">
                {load.kind === "loading" && (
                    <p className="px-2 text-muted-foreground">Loading…</p>
                )}
                {load.kind === "error" && (
                    <div className="flex items-center gap-2 px-2">
                        <p>Couldn't load action items</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setLoad({ kind: "loading" });
                                setAttempt((value) => value + 1);
                            }}
                        >
                            Retry
                        </Button>
                    </div>
                )}
                {load.kind === "loaded" && load.tasks.length === 0 && (
                    <p className="px-2 text-muted-foreground">
                        No action items yet
                    </p>
                )}
                {load.kind === "loaded" && load.tasks.length > 0 && (
                    <ul className="flex flex-col gap-1">
                        {load.tasks.map((task) => (
                            <ActionItemRow
                                key={task.id}
                                task={task}
                                completed={isCompleted(task)}
                                onCompletedChange={(value) =>
                                    changeCompleted(task, value)
                                }
                                onSaveResult={(ok) =>
                                    setMessage(ok ? null : "save")
                                }
                                inputRef={itemFieldRef(task.id)}
                            />
                        ))}
                    </ul>
                )}
            </div>
            <div className="flex flex-col gap-2 p-4">
                {message !== null && (
                    <p role="alert" className="text-sm text-destructive">
                        {MESSAGE_TEXTS[message]}
                    </p>
                )}
                <Input
                    aria-label="Add action item"
                    placeholder="Add action item"
                    value={newText}
                    disabled={load.kind !== "loaded"}
                    onChange={(event) => setNewText(event.target.value)}
                    onKeyDown={add}
                />
            </div>
        </section>
    );
}
