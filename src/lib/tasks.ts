import { invoke } from "@tauri-apps/api/core";

/**
 * One task. The user interface calls a task of a meeting an "action item". The backend
 * type is `Task` in `src-tauri/src/tasks.rs`.
 *
 * The stage of a task follows from `rank`, `startedAt`, `completedAt`, and `deletedAt`
 * (see `stageOf`). A completed or deleted task keeps its rank and its start, so that it
 * can go back to its place.
 */
export type Task = {
    id: number;
    /** The meeting that the task belongs to, or `null` if it belongs to no meeting. */
    meetingId: number | null;
    /** The one line of text that tells what to do. */
    title: string;
    /** The Markdown text that tells more about the task. It is empty when the user wrote nothing. */
    description: string;
    /** The project of the task, or `null` if the task is on no project. */
    projectId: number | null;
    /** The initiative of the task, or `null` if the task is on no initiative. The initiative belongs to the project of the task. */
    initiativeId: number | null;
    /** The key that gives the place of the task in the list of prioritized tasks, or `null` while the task is in the Icebox. Compare ranks as text. */
    rank: string | null;
    /** The time when the task was created, as an RFC 3339 timestamp in UTC. */
    createdAt: string;
    /** The time when the content of the task was last changed, as an RFC 3339 timestamp in UTC. */
    updatedAt: string;
    /** The time when the user started the task, as an RFC 3339 timestamp in UTC, or `null` if it is not started. */
    startedAt: string | null;
    /** The time when the task was completed, as an RFC 3339 timestamp in UTC, or `null` if it is not done. */
    completedAt: string | null;
    /** The time when the user deleted the task, as an RFC 3339 timestamp in UTC, or `null` if it is not deleted. */
    deletedAt: string | null;
};

/** The stage of a task that is not deleted. Each stage is one column of the Work board. */
export type TaskStage = "current" | "backlog" | "icebox" | "done";

/**
 * Returns the stage of a task that is not deleted. A completed task is done. A task
 * without a rank is in the Icebox. A task with a rank is in Current when it is started,
 * and in the Backlog when it is not started.
 */
export function stageOf(task: Task): TaskStage {
    if (task.completedAt !== null) return "done";
    if (task.rank === null) return "icebox";
    return task.startedAt !== null ? "current" : "backlog";
}

/** The name that the Work section shows for a task that has an empty title. */
const UNTITLED_TASK = "Untitled task";

/** Returns the title to show for a task. A task with an empty title shows "Untitled task". */
export function taskTitle(task: { title: string }): string {
    return task.title.trim() === "" ? UNTITLED_TASK : task.title;
}

/** The name that the controls of an action item use when the item has an empty text. */
const UNTITLED_ACTION_ITEM = "Untitled action item";

/** Returns the name to show for an action item. An item with an empty text shows the untitled name. */
export function actionItemName(text: string): string {
    return text.trim() === "" ? UNTITLED_ACTION_ITEM : text;
}

/** Returns the tasks that are not deleted, in no specific order. */
export function listTasks(): Promise<Task[]> {
    return invoke<Task[]>("list_tasks");
}

/** Returns the task with the given identifier, also a deleted task, or `null` if no task has it. */
export function getTask(id: number): Promise<Task | null> {
    return invoke<Task | null>("get_task", { id });
}

/** Returns the tasks of a meeting that are not deleted, with the oldest first. */
export function listMeetingTasks(meetingId: number): Promise<Task[]> {
    return invoke<Task[]>("list_meeting_tasks", { meetingId });
}

/**
 * Creates a task in the Icebox for a meeting and returns the stored task. The task gets
 * the project of the meeting, and gets its initiative when the meeting covers exactly one
 * initiative that is not deleted.
 */
export function createMeetingTask(
    meetingId: number,
    title: string,
): Promise<Task> {
    return invoke<Task>("create_meeting_task", { meetingId, title });
}

/**
 * Creates a task in the Icebox, outside a meeting, and returns the stored task. The backend
 * removes the spaces at the start and the end of the title. When `initiativeId` is set, the
 * task gets the project of that initiative, and `projectId` is ignored. The backend refuses
 * a project or an initiative that is deleted, and a task whose title, description, project,
 * and initiative are all empty.
 */
export function createTask(fields: {
    title: string;
    description: string;
    projectId: number | null;
    initiativeId: number | null;
}): Promise<Task> {
    return invoke<Task>("create_task", fields);
}

/**
 * Replaces the title of a task and returns the stored task. The backend removes the spaces
 * at the start and the end of the title.
 */
export function updateTaskTitle(id: number, title: string): Promise<Task> {
    return invoke<Task>("update_task_title", { id, title });
}

/** Replaces the Markdown description of a task and returns the stored task. */
export function updateTaskDescription(
    id: number,
    description: string,
): Promise<Task> {
    return invoke<Task>("update_task_description", { id, description });
}

/**
 * Sets the project of a task, or clears it with `null`, and returns the stored task. The
 * task keeps its initiative only when the initiative belongs to the new project. The
 * backend refuses a deleted project. Setting the project that the task has changes nothing.
 */
export function setTaskProject(
    id: number,
    projectId: number | null,
): Promise<Task> {
    return invoke<Task>("set_task_project", { id, projectId });
}

/**
 * Sets the initiative of a task, or clears it with `null`, and returns the stored task.
 * With an initiative, the task also gets the project of that initiative. Without one, the
 * task keeps its project. The backend refuses a deleted initiative. Setting the initiative
 * that the task has changes nothing.
 */
export function setTaskInitiative(
    id: number,
    initiativeId: number | null,
): Promise<Task> {
    return invoke<Task>("set_task_initiative", { id, initiativeId });
}

/**
 * Moves a task to a column of the Work board and returns the stored task. For Current
 * and the Backlog, `index` is the place among the cards of that column, counted from 0
 * without the task. The backend ignores `index` for the Icebox and Done. The backend
 * refuses a completed or deleted task.
 */
export function moveTask(
    id: number,
    destination: TaskStage,
    index: number,
): Promise<Task> {
    return invoke<Task>("move_task", { id, destination, index });
}

/**
 * Starts a task in the Backlog and returns the stored task. The task keeps its place in
 * the list. The backend refuses a task that is not in the Backlog.
 */
export function startTask(id: number): Promise<Task> {
    return invoke<Task>("start_task", { id });
}

/**
 * Marks a task as done or as not done and returns the stored task. A task that is not
 * done goes back to its held place. The backend refuses a deleted task.
 */
export function setTaskCompleted(
    id: number,
    completed: boolean,
): Promise<Task> {
    return invoke<Task>("set_task_completed", { id, completed });
}

/** Marks a task as deleted. The task keeps its stage and its place, so `restoreTask` can bring it back. */
export function deleteTask(id: number): Promise<void> {
    return invoke<void>("delete_task", { id });
}

/** Brings a deleted task back to its stage and its held place, and returns the stored task. */
export function restoreTask(id: number): Promise<Task> {
    return invoke<Task>("restore_task", { id });
}
