import type { BoardColumnDef, BoardMessages } from "@/components/board/board";
import { compareRanks } from "@/lib/ranks";
import { stageOf, taskTitle, type Task, type TaskStage } from "@/lib/tasks";

/** The cards of the Work board, in each column from the top. */
export type WorkBoard = Record<TaskStage, Task[]>;

/** Returns a Work board with no cards. */
export function emptyWorkBoard(): WorkBoard {
    return { current: [], backlog: [], icebox: [], done: [] };
}

/** Sorts tasks of the list by rank. */
function byRank(a: Task, b: Task): number {
    return compareRanks(a.rank!, b.rank!) || a.id - b.id;
}

/** Sorts tasks with the task that was created last first. */
function byCreatedNewestFirst(a: Task, b: Task): number {
    return b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
}

/** Sorts tasks with the task that was completed last first. */
function byCompletedNewestFirst(a: Task, b: Task): number {
    return b.completedAt!.localeCompare(a.completedAt!) || b.id - a.id;
}

/** The order of the cards in each column. */
const ORDER: Record<TaskStage, (a: Task, b: Task) => number> = {
    current: byRank,
    backlog: byRank,
    icebox: byCreatedNewestFirst,
    done: byCompletedNewestFirst,
};

/** Returns the place of `task` among `others`, which are sorted by `order`. */
function sortedPlace(
    task: Task,
    others: Task[],
    order: (a: Task, b: Task) => number,
): number {
    const index = others.findIndex((other) => order(task, other) < 0);
    return index === -1 ? others.length : index;
}

/**
 * Returns the Work board of the tasks `tasks`, which must not be deleted. Current and the
 * Backlog are in the order of their ranks. The Icebox has the task that was created last
 * first. Done has the task that was completed last first.
 */
export function buildWorkBoard(tasks: Task[]): WorkBoard {
    const board = emptyWorkBoard();
    for (const task of tasks) board[stageOf(task)].push(task);
    for (const stage of Object.keys(board) as TaskStage[]) {
        board[stage].sort(ORDER[stage]);
    }
    return board;
}

/** Returns the board without the task with the identifier `id`. */
export function removeTask(board: WorkBoard, id: number): WorkBoard {
    return {
        current: board.current.filter((task) => task.id !== id),
        backlog: board.backlog.filter((task) => task.id !== id),
        icebox: board.icebox.filter((task) => task.id !== id),
        done: board.done.filter((task) => task.id !== id),
    };
}

/**
 * Returns the board with `task` in the column of its stage, at its sorted place. If the board
 * holds the task in a column, the task leaves that column first.
 */
export function placeTask(board: WorkBoard, task: Task): WorkBoard {
    const next = removeTask(board, task.id);
    const stage = stageOf(task);
    const column = [...next[stage]];
    column.splice(sortedPlace(task, column, ORDER[stage]), 0, task);
    next[stage] = column;
    return next;
}

/**
 * Returns the board with `task` in place of the card that has its identifier. The card keeps
 * its column and its place, also when the stage or the order of `task` differs. If the board
 * does not hold the task, the function returns the board that it gets.
 */
export function replaceTask(board: WorkBoard, task: Task): WorkBoard {
    const replace = (tasks: Task[]) =>
        tasks.some((card) => card.id === task.id)
            ? tasks.map((card) => (card.id === task.id ? task : card))
            : tasks;
    return {
        current: replace(board.current),
        backlog: replace(board.backlog),
        icebox: replace(board.icebox),
        done: replace(board.done),
    };
}

/**
 * The columns of the Work board, from left to right. The user orders Current and the Backlog.
 * The Icebox is sorted by the time of creation, so a card from another column goes to the
 * place of its creation time. Done is sorted by the time of completion, so a card from another
 * column goes first. Cards in Done cannot be dragged.
 */
export const WORK_COLUMNS: readonly BoardColumnDef<Task, TaskStage>[] = [
    {
        id: "current",
        title: "Current",
        ordered: true,
        draggable: true,
        emptyText: "No tasks",
    },
    {
        id: "backlog",
        title: "Backlog",
        ordered: true,
        draggable: true,
        emptyText: "No tasks",
    },
    {
        id: "icebox",
        title: "Icebox",
        ordered: false,
        draggable: true,
        emptyText: "No tasks",
        sortedIndex: (task, others) =>
            sortedPlace(task, others, byCreatedNewestFirst),
    },
    {
        id: "done",
        title: "Done",
        ordered: false,
        draggable: false,
        emptyText: "No tasks",
        sortedIndex: () => 0,
    },
];

/** The messages that screen readers announce while a card of the Work board is dragged. */
export const WORK_MESSAGES: BoardMessages<Task, TaskStage> = {
    pickedUp: (task) => `Picked up ${taskTitle(task)}.`,
    over: (task, column, position, count) =>
        `${taskTitle(task)} is in ${column.title}, position ${position} of ${count}.`,
    dropped: (task, column, position, count) => {
        if (column.id === "icebox")
            return `${taskTitle(task)} was moved to Icebox.`;
        if (column.id === "done") return `${taskTitle(task)} was completed.`;
        return `${taskTitle(task)} was moved to ${column.title}, position ${position} of ${count}.`;
    },
    putBack: (task) => `${taskTitle(task)} was put back.`,
};
