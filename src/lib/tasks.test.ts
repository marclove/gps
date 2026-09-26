import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    actionItemName,
    createTask,
    deleteTask,
    listMeetingTasks,
    setTaskCompleted,
    updateTaskDescription,
} from "./tasks";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
});

describe("task commands", () => {
    it("calls the backend commands with their arguments", async () => {
        await listMeetingTasks(1);
        await createTask(1, "Send the deck");
        await updateTaskDescription(3, "Call Sam");
        await setTaskCompleted(3, true);
        await deleteTask(3);

        expect(invoke.mock.calls).toEqual([
            ["list_meeting_tasks", { meetingId: 1 }],
            ["create_task", { meetingId: 1, description: "Send the deck" }],
            ["update_task_description", { id: 3, description: "Call Sam" }],
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
