import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { BoardCardCopy } from "@/components/board/board-card";
import { Button } from "@/components/ui/button";
import { taskTitle, type Task, type TaskStage } from "@/lib/tasks";
import { cn } from "@/lib/utils";

/**
 * The content of a card on the Work board: the shown title of the task, and the name of its
 * project `projectName` below it when the task has a project. If `done` is true, the content
 * also shows a check mark, and the title is muted. When `withActions` is true, the content
 * leaves room at its right for the action buttons of the card.
 */
export function TaskCardContent({
    task,
    projectName,
    done,
    withActions,
}: {
    task: Task;
    projectName: string | null;
    done: boolean;
    withActions: boolean;
}) {
    return (
        <>
            <span
                className={cn(
                    "flex w-full items-start gap-1.5",
                    done && "text-muted-foreground",
                    // The action buttons sit above the top right corner of the card.
                    withActions && "pr-7",
                )}
            >
                {done && (
                    <CheckIcon
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                    />
                )}
                <span className="min-w-0 font-medium break-words">
                    {taskTitle(task)}
                </span>
            </span>
            {projectName !== null && (
                <span className="min-w-0 text-xs break-words text-muted-foreground">
                    {projectName}
                </span>
            )}
        </>
    );
}

/**
 * A copy of a card that the board shows below the pointer while the card is dragged. It
 * looks like the card in the column `stage`, without its action buttons. Screen readers and
 * the keyboard ignore it, because the card itself stays in its list.
 */
export function TaskCardCopy({
    task,
    projectName,
    stage,
}: {
    task: Task;
    projectName: string | null;
    stage: TaskStage;
}) {
    return (
        <BoardCardCopy>
            <TaskCardContent
                task={task}
                projectName={projectName}
                done={stage === "done"}
                withActions={false}
            />
        </BoardCardCopy>
    );
}

/**
 * The action button of a card in Done, named `Reopen "<shown title>"`, which calls
 * `onReopen`.
 */
export function TaskReopenButton({
    task,
    onReopen,
}: {
    task: Task;
    onReopen: (task: Task) => void;
}) {
    return (
        <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Reopen "${taskTitle(task)}"`}
            onClick={() => onReopen(task)}
        >
            <RotateCcwIcon />
        </Button>
    );
}
