import { PlusIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Board, type BoardColumnDef } from "@/components/board/board";
import { moveCard } from "@/components/board/cards";
import { PageHeader } from "@/components/page-header";
import { useDelete } from "@/components/use-delete";
import { useFailureToast } from "@/components/use-failure-toast";
import { Button } from "@/components/ui/button";
import { listProjects, projectDisplayName } from "@/lib/projects";
import {
    createTask,
    listTasks,
    moveTask,
    setTaskCompleted,
    startTask,
    type Task,
    type TaskStage,
} from "@/lib/tasks";
import { AddTaskField } from "./add-task-field";
import { TaskCardActions, TaskCardContent, TaskCardCopy } from "./task-card";
import {
    buildWorkBoard,
    emptyWorkBoard,
    hasTaskAction,
    placeTask,
    removeTask,
    replaceTask,
    WORK_COLUMNS,
    WORK_MESSAGES,
    type WorkBoard,
} from "./work-board";
import { useTaskSheet } from "./use-task-sheet";

type BoardState =
    | { kind: "loading" }
    | { kind: "error" }
    | {
          kind: "loaded";
          board: WorkBoard;
          /** The shown name of each project, also of a deleted one. */
          projectNames: Map<number, string>;
      };

/**
 * The page that shows the tasks that are not deleted on a board with the columns Current,
 * Backlog, Icebox, and Done. The "Add task" field above the Icebox adds a task at the top of
 * the Icebox.
 *
 * A dragged card moves on the board at once, and so does a card whose "Start" button the user
 * clicks. A card whose "Reopen" button the user clicks moves when the backend answers, because
 * only the backend knows its new place. If the backend cannot save a move or a start, the page
 * shows a failure toast and loads the board again when no other move is waiting for the
 * backend, so that the board shows what the backend has.
 *
 * A card, and the "New task" button for a draft, open the task sheet. A saved change shows on
 * the card, which stays in its place. A task that a draft created appears at the top of the
 * Icebox. After a delete, the card leaves the board, and the focus moves to "New task". The
 * board loads again after each delete and restore.
 */
export function WorkPage() {
    const [state, setState] = useState<BoardState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const failureToast = useFailureToast();
    // The number of moves and starts that wait for the backend.
    const pendingMoves = useRef(0);
    // The number of changes that the page started, so that a load can find out that a change
    // started while it waited for the backend.
    const startedChanges = useRef(0);
    // True when the board can differ from the backend, and the page must load it again when
    // no move waits for the backend.
    const reloadAfterMoves = useRef(false);
    const { version } = useDelete();
    const newButton = useRef<HTMLButtonElement>(null);
    const { openTask, openDraft, sheet } = useTaskSheet({
        onSaved: (task) => {
            startedChanges.current += 1;
            changeBoard((board) => replaceTask(board, task));
        },
        onCreated: (task) => {
            startedChanges.current += 1;
            changeBoard((board) => placeTask(board, task));
        },
        onDeleted: (id) => changeBoard((board) => removeTask(board, id)),
        focusAfterDelete: newButton,
    });

    useEffect(() => {
        let current = true;
        const changesBefore = startedChanges.current;
        void Promise.allSettled([
            listTasks(),
            listProjects({ includeDeleted: true }),
        ]).then(([tasks, projects]) => {
            if (!current) return;
            if (tasks.status === "rejected" || projects.status === "rejected") {
                setState({ kind: "error" });
                return;
            }
            if (startedChanges.current !== changesBefore) {
                // The list can be older than a change that the board shows. Load it again
                // after the moves.
                if (pendingMoves.current > 0) {
                    reloadAfterMoves.current = true;
                } else {
                    setAttempt((value) => value + 1);
                }
                return;
            }
            setState({
                kind: "loaded",
                board: buildWorkBoard(tasks.value),
                projectNames: new Map(
                    projects.value.map((project) => [
                        project.id,
                        projectDisplayName(project.name),
                    ]),
                ),
            });
        });
        return () => {
            current = false;
        };
    }, [attempt, version]);

    function retry() {
        setState({ kind: "loading" });
        setAttempt((value) => value + 1);
    }

    function changeBoard(change: (board: WorkBoard) => WorkBoard) {
        setState((current) =>
            current.kind === "loaded"
                ? { ...current, board: change(current.board) }
                : current,
        );
    }

    /**
     * Sends a move or a start to the backend, and shows the answer in place of the card. If
     * the backend refuses it, shows `failure` in a failure toast and loads the board again
     * when no other move waits for the backend.
     */
    async function save(request: Promise<Task>, failure: string) {
        pendingMoves.current += 1;
        startedChanges.current += 1;
        try {
            const task = await request;
            changeBoard((board) => replaceTask(board, task));
        } catch {
            failureToast.show(failure);
            // A later move can have succeeded, so the board loads the list from the backend
            // instead of putting back an earlier board.
            reloadAfterMoves.current = true;
        } finally {
            pendingMoves.current -= 1;
            if (pendingMoves.current === 0 && reloadAfterMoves.current) {
                reloadAfterMoves.current = false;
                setAttempt((value) => value + 1);
            }
        }
    }

    function move(id: number, to: TaskStage, index: number) {
        // The backend ignores the index in the Icebox and in Done. The board gives the sorted
        // place of the card there, so the card shows at that place until the backend answers.
        changeBoard((board) => moveCard(board, id, to, index));
        void save(
            moveTask(id, to, index),
            "Couldn't move the task. Try again.",
        );
    }

    function start(task: Task) {
        const startedAt = new Date().toISOString();
        changeBoard((board) => placeTask(board, { ...task, startedAt }));
        void save(startTask(task.id), "Couldn't start the task. Try again.");
    }

    async function reopen(task: Task) {
        startedChanges.current += 1;
        try {
            const reopened = await setTaskCompleted(task.id, false);
            changeBoard((board) => placeTask(board, reopened));
        } catch {
            failureToast.show("Couldn't reopen the task. Try again.");
        }
    }

    async function add(title: string): Promise<boolean> {
        startedChanges.current += 1;
        try {
            const task = await createTask({
                title,
                description: "",
                projectId: null,
                initiativeId: null,
            });
            changeBoard((board) => placeTask(board, task));
            return true;
        } catch {
            failureToast.show("Couldn't add the task. Try again.");
            return false;
        }
    }

    // The latest `add`, so that the columns keep their identity between renders, and the
    // announcements of the board are not made again on each render.
    const addRef = useRef(add);
    useEffect(() => {
        addRef.current = add;
    });
    const columns = useMemo<readonly BoardColumnDef<Task, TaskStage>[]>(
        () =>
            WORK_COLUMNS.map((column) =>
                column.id === "icebox"
                    ? {
                          ...column,
                          header: (
                              <AddTaskField
                                  onAdd={(title) => addRef.current(title)}
                              />
                          ),
                      }
                    : column,
            ),
        [],
    );

    const board = state.kind === "loaded" ? state.board : emptyWorkBoard();

    function open(id: number) {
        const task = Object.values(board)
            .flat()
            .find((card) => card.id === id);
        openTask(id, task?.title ?? "");
    }
    function projectName(task: Task): string | null {
        if (task.projectId === null || state.kind !== "loaded") return null;
        return state.projectNames.get(task.projectId) ?? null;
    }

    return (
        // The header stays in place, and the board gets the remaining height.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
            <PageHeader crumbs={[{ label: "Work" }]}>
                <Button ref={newButton} onClick={openDraft}>
                    <PlusIcon />
                    New task
                </Button>
            </PageHeader>
            {state.kind === "error" ? (
                <div className="flex items-start gap-2 px-6 text-sm">
                    <p>Couldn't load tasks</p>
                    <Button variant="outline" size="sm" onClick={retry}>
                        Retry
                    </Button>
                </div>
            ) : (
                <div className="grid min-h-0 grid-rows-[minmax(0,1fr)]">
                    <Board
                        columns={columns}
                        cards={board}
                        renderContent={(task, stage) => (
                            <TaskCardContent
                                task={task}
                                projectName={projectName(task)}
                                done={stage === "done"}
                                withActions={hasTaskAction(stage)}
                            />
                        )}
                        renderCopy={(task, stage) => (
                            <TaskCardCopy
                                task={task}
                                projectName={projectName(task)}
                                stage={stage}
                            />
                        )}
                        renderActions={(task, stage) =>
                            hasTaskAction(stage) ? (
                                <TaskCardActions
                                    task={task}
                                    stage={stage}
                                    onStart={start}
                                    onReopen={(card) => void reopen(card)}
                                />
                            ) : null
                        }
                        messages={WORK_MESSAGES}
                        onOpen={open}
                        onMove={move}
                        loading={state.kind === "loading"}
                    />
                </div>
            )}
            {sheet}
        </div>
    );
}
