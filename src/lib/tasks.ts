import { invoke } from "@tauri-apps/api/core";

/**
 * One task. The user interface calls a task of a meeting an "action item". The backend
 * type is `Task` in `src-tauri/src/tasks.rs`.
 */
export type Task = {
    id: number;
    /** The meeting that the task belongs to, or `null` if it belongs to no meeting. */
    meetingId: number | null;
    /** The one line of text that tells what to do. */
    title: string;
    /** The time when the task was created, as an RFC 3339 timestamp in UTC. */
    createdAt: string;
    /** The time when the task was last changed, as an RFC 3339 timestamp in UTC. */
    updatedAt: string;
    /** The time when the task was completed, as an RFC 3339 timestamp in UTC, or `null` if it is not done. */
    completedAt: string | null;
};

/** The name that the controls of an action item use when the item has an empty text. */
const UNTITLED_ACTION_ITEM = "Untitled action item";

/** Returns the name to show for an action item. An item with an empty text shows the untitled name. */
export function actionItemName(text: string): string {
    return text.trim() === "" ? UNTITLED_ACTION_ITEM : text;
}

/** Returns the tasks of a meeting, with the oldest first. */
export function listMeetingTasks(meetingId: number): Promise<Task[]> {
    return invoke<Task[]>("list_meeting_tasks", { meetingId });
}

/** Creates a task that is not done in a meeting and returns the stored task. */
export function createTask(meetingId: number, title: string): Promise<Task> {
    return invoke<Task>("create_task", { meetingId, title });
}

/** Replaces the title of a task and returns the stored task. */
export function updateTaskTitle(id: number, title: string): Promise<Task> {
    return invoke<Task>("update_task_title", { id, title });
}

/** Marks a task as done or as not done and returns the stored task. */
export function setTaskCompleted(
    id: number,
    completed: boolean,
): Promise<Task> {
    return invoke<Task>("set_task_completed", { id, completed });
}

/** Deletes a task permanently. */
export function deleteTask(id: number): Promise<void> {
    return invoke<void>("delete_task", { id });
}
