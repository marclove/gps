import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    actionItemName,
    createMeetingTask,
    deleteTask,
    getTask,
    listMeetingTasks,
    listTasks,
    setTaskCompleted,
    stageOf,
    taskTitle,
    updateTaskTitle,
    type Task,
} from "./tasks";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
});

describe("task commands", () => {
    it("calls the backend commands with their arguments", async () => {
        await listTasks();
        await getTask(2);
        await listMeetingTasks(1);
        await createMeetingTask(1, "Send the deck");
        await updateTaskTitle(3, "Call Sam");
        await setTaskCompleted(3, true);
        await deleteTask(3);

        expect(invoke.mock.calls).toEqual([
            ["list_tasks"],
            ["get_task", { id: 2 }],
            ["list_meeting_tasks", { meetingId: 1 }],
            ["create_meeting_task", { meetingId: 1, title: "Send the deck" }],
            ["update_task_title", { id: 3, title: "Call Sam" }],
            ["set_task_completed", { id: 3, completed: true }],
            ["delete_task", { id: 3 }],
        ]);
    });
});

describe("actionItemName", () => {
    it("names an item with empty or blank text Untitled action item", () => {
        expect(actionItemName("")).toBe("Untitled action item");
        expect(actionItemName("   ")).toBe("Untitled action item");
        expect(actionItemName("Send the deck")).toBe("Send the deck");
    });
});

function task(overrides: Partial<Task> = {}): Task {
    return {
        id: 1,
        meetingId: null,
        title: "Send the deck",
        description: "",
        projectId: null,
        initiativeId: null,
        rank: null,
        createdAt: "2026-09-24T10:00:00.000Z",
        updatedAt: "2026-09-24T10:00:00.000Z",
        startedAt: null,
        completedAt: null,
        deletedAt: null,
        ...overrides,
    };
}

describe("stageOf", () => {
    it("puts a task without a rank in the Icebox", () => {
        expect(stageOf(task())).toBe("icebox");
    });

    it("puts a task with a rank in the Backlog, or in Current when it is started", () => {
        expect(stageOf(task({ rank: "8" }))).toBe("backlog");
        expect(
            stageOf(task({ rank: "8", startedAt: "2026-09-25T10:00:00.000Z" })),
        ).toBe("current");
    });

    it("puts a completed task in Done, also when it keeps its rank and start", () => {
        const completedAt = "2026-09-26T10:00:00.000Z";
        expect(stageOf(task({ completedAt }))).toBe("done");
        expect(
            stageOf(
                task({
                    rank: "8",
                    startedAt: "2026-09-25T10:00:00.000Z",
                    completedAt,
                }),
            ),
        ).toBe("done");
    });
});

describe("taskTitle", () => {
    it("names a task with an empty or blank title Untitled task", () => {
        expect(taskTitle({ title: "" })).toBe("Untitled task");
        expect(taskTitle({ title: "   " })).toBe("Untitled task");
        expect(taskTitle({ title: "Send the deck" })).toBe("Send the deck");
    });
});
