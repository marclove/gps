import {
    useEffect,
    useId,
    useImperativeHandle,
    useRef,
    useState,
    type Ref,
} from "react";
import { useDelete } from "@/components/use-delete";
import { Button } from "@/components/ui/button";
import { listTasks, taskTitle, type Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { buildWorkBoard } from "./work-board";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    // All tasks that are not deleted. The list shows the tasks that match the filter.
    | { kind: "loaded"; tasks: Task[] };

/** The actions of the list "Tasks" that its page can call. */
export type TaskListHandle = {
    /**
     * Takes the row of a task that was deleted, such as in the task sheet, out of the list.
     * Returns the element that gets the focus: the row that is then at its place, else the
     * row before it, else the heading of the list. The heading is also returned when the list
     * does not show the task.
     */
    deleted: (id: number) => HTMLElement | null;
};

/** Returns the tasks with `task` in place of the task with its identifier, or added at the end. */
function withTask(tasks: Task[], task: Task): Task[] {
    return tasks.some((stored) => stored.id === task.id)
        ? tasks.map((stored) => (stored.id === task.id ? task : stored))
        : [...tasks, task];
}

/** Returns the rows of the list: the tasks in Current, then in the Backlog, then in the Icebox. */
function rowsOf(tasks: Task[]): Task[] {
    const board = buildWorkBoard(tasks);
    return [...board.current, ...board.backlog, ...board.icebox];
}

/**
 * The list "Tasks": a region with a heading and one row for each task that matches `filter`
 * and is not completed. The rows show the tasks in Current, then in the Backlog, each in the
 * order of the list, then the tasks in the Icebox, with the newest first. Each row is a button
 * that shows the shown title of the task. A click on a row calls `onOpen` with the identifier
 * and the title of the task. An empty list says "No tasks".
 *
 * The list loads the tasks when it opens, and again after each delete and restore.
 * `savedTask` is the task that the task sheet saved last. The list shows it in its row, and
 * takes the row out when the task no longer matches `filter`. Only the rows scroll. `ref` gets
 * the actions of the list. `className` adds classes to the region, for example to limit its
 * height.
 */
export function TaskList({
    filter,
    onOpen,
    savedTask,
    className,
    ref,
}: {
    filter: (task: Task) => boolean;
    onOpen: (id: number, title: string) => void;
    savedTask?: Task;
    className?: string;
    ref?: Ref<TaskListHandle>;
}) {
    const headingId = useId();
    const { version } = useDelete();
    const [load, setLoad] = useState<LoadState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const heading = useRef<HTMLHeadingElement>(null);
    // The button of each row, by task identifier, so that the focus can move to a row.
    const rowButtons = useRef(new Map<number, HTMLButtonElement>());

    useEffect(() => {
        let current = true;
        listTasks().then(
            (tasks) => current && setLoad({ kind: "loaded", tasks }),
            () => current && setLoad({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt, version]);

    // Shows each new saved task. The list does not load again after a save.
    const [shownSaved, setShownSaved] = useState(savedTask);
    if (savedTask !== shownSaved) {
        setShownSaved(savedTask);
        if (savedTask !== undefined && load.kind === "loaded") {
            setLoad({ kind: "loaded", tasks: withTask(load.tasks, savedTask) });
        }
    }

    const rows =
        load.kind === "loaded" ? rowsOf(load.tasks.filter(filter)) : [];

    useImperativeHandle(ref, () => ({
        deleted(id: number) {
            const index = rows.findIndex((task) => task.id === id);
            const rest = rows.filter((task) => task.id !== id);
            const next =
                index === -1
                    ? undefined
                    : rest[Math.min(index, rest.length - 1)];
            setLoad((current) =>
                current.kind === "loaded"
                    ? {
                          kind: "loaded",
                          tasks: current.tasks.filter((task) => task.id !== id),
                      }
                    : current,
            );
            return (next && rowButtons.current.get(next.id)) ?? heading.current;
        },
    }));

    function rowButtonRef(id: number) {
        return (element: HTMLButtonElement | null) => {
            if (element) rowButtons.current.set(id, element);
            else rowButtons.current.delete(id);
        };
    }

    return (
        // The heading stays in place, and the rows scroll.
        <section
            aria-labelledby={headingId}
            className={cn(
                "grid min-h-0 grid-rows-[auto_minmax(0,1fr)]",
                className,
            )}
        >
            {/* The heading takes the focus when the row of a deleted task was the last row. */}
            <h2
                ref={heading}
                id={headingId}
                tabIndex={-1}
                className="px-6 pb-2 text-sm font-medium outline-none"
            >
                Tasks
            </h2>
            {/* `pt-1` leaves room for the focus ring of the first row, which the scrolling
                area would cut off. */}
            <div className="min-h-0 overflow-y-auto px-6 pt-1 pb-4 text-sm">
                {load.kind === "loading" && (
                    <p className="text-muted-foreground">Loading…</p>
                )}
                {load.kind === "error" && (
                    <div className="flex items-center gap-2">
                        <p>Couldn't load tasks</p>
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
                {load.kind === "loaded" && rows.length === 0 && (
                    <p className="text-muted-foreground">No tasks</p>
                )}
                {rows.length > 0 && (
                    // The WebKit of the macOS window draws no list marker when the item
                    // holds only a flex box, so each item draws its own bullet. Safari drops
                    // the list role of a list without markers, so the role is set again.
                    <ul role="list" className="space-y-0.5">
                        {rows.map((task) => (
                            <li
                                key={task.id}
                                className="flex items-center gap-1 before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']"
                            >
                                <button
                                    ref={rowButtonRef(task.id)}
                                    type="button"
                                    onClick={() => onOpen(task.id, task.title)}
                                    className="flex min-w-0 flex-1 items-center rounded-lg px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                    <span className="min-w-0 truncate">
                                        {taskTitle(task)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
