import { beforeEach, describe, expect, it } from "vitest";
import { FakeBackend, type StoredTask } from "@/test/fake-backend";

let fake: FakeBackend;

beforeEach(() => {
    fake = new FakeBackend();
});

function move(task: StoredTask, destination: string, index = 0) {
    return fake.handle("move_task", { id: task.id, destination, index });
}

describe("moving tasks", () => {
    beforeEach(() => {
        fake.seedTask({ title: "C1", stage: "current" });
        fake.seedTask({ title: "B1", stage: "backlog" });
        fake.seedTask({ title: "C2", stage: "current" });
        fake.seedTask({ title: "B2", stage: "backlog" });
        fake.seedTask({ title: "Ice", stage: "icebox" });
    });

    it("seeds the list in the order of seeding", () => {
        expect(fake.listOrder()).toEqual(["C1", "B1", "C2", "B2"]);
        expect(fake.workColumn("current")).toEqual(["C1", "C2"]);
        expect(fake.workColumn("backlog")).toEqual(["B1", "B2"]);
    });

    it("puts the task directly after the card above the index", async () => {
        await move(fake.findTask("Ice"), "current", 1);
        expect(fake.listOrder()).toEqual(["C1", "Ice", "B1", "C2", "B2"]);
        expect(fake.findTask("Ice").startedAt).not.toBeNull();
    });

    it("puts the task directly before the card below index 0", async () => {
        await move(fake.findTask("Ice"), "backlog", 0);
        expect(fake.listOrder()).toEqual(["C1", "Ice", "B1", "C2", "B2"]);
        expect(fake.workColumn("backlog")).toEqual(["Ice", "B1", "B2"]);
    });

    it("puts the task at the end of the list when the column has no other card", async () => {
        await move(fake.findTask("B1"), "icebox");
        await move(fake.findTask("B2"), "icebox");
        await move(fake.findTask("C1"), "backlog", 0);
        expect(fake.listOrder()).toEqual(["C2", "C1"]);
        expect(fake.findTask("C1").startedAt).toBeNull();
    });

    it("clears the rank and the start for the Icebox", async () => {
        await move(fake.findTask("C1"), "icebox");
        const task = fake.findTask("C1");
        expect(task.rank).toBeNull();
        expect(task.startedAt).toBeNull();
        expect(fake.workColumn("icebox")).toEqual(["Ice", "C1"]);
    });

    it("completes the task for Done and keeps its rank and start", async () => {
        const before = { ...fake.findTask("C2") };
        await move(fake.findTask("C2"), "done");
        const task = fake.findTask("C2");
        expect(task.completedAt).not.toBeNull();
        expect(task.rank).toBe(before.rank);
        expect(task.startedAt).toBe(before.startedAt);
        expect(fake.workColumn("done")).toEqual(["C2"]);
    });

    it("refuses completed and deleted tasks", async () => {
        const done = fake.seedTask({ title: "Done", stage: "done" });
        const gone = fake.seedTask({ title: "Gone", deleted: true });
        await expect(move(done, "backlog")).rejects.toBeDefined();
        await expect(move(gone, "backlog")).rejects.toBeDefined();
    });

    it("starts only a task in the Backlog and keeps its rank", async () => {
        const b1 = fake.findTask("B1");
        const rank = b1.rank;
        await fake.handle("start_task", { id: b1.id });
        expect(fake.workColumn("current")).toEqual(["C1", "B1", "C2"]);
        expect(b1.rank).toBe(rank);
        await expect(
            fake.handle("start_task", { id: fake.findTask("Ice").id }),
        ).rejects.toBeDefined();
    });

    it("reopens a task directly after the task that took its held place", async () => {
        const other = new FakeBackend();
        other.seedTask({ title: "A", stage: "current", rank: "4" });
        const b = other.seedTask({ title: "B", stage: "backlog", rank: "8" });
        other.seedTask({ title: "C", stage: "current", rank: "c" });
        const d = other.seedTask({ title: "D", stage: "backlog", rank: "e" });
        await other.handle("set_task_completed", { id: b.id, completed: true });
        // D moves between A and C, which gives it the rank that B holds.
        await other.handle("move_task", {
            id: d.id,
            destination: "current",
            index: 1,
        });
        expect(d.rank).toBe(b.rank);
        await other.handle("set_task_completed", {
            id: b.id,
            completed: false,
        });
        expect(other.listOrder()).toEqual(["A", "D", "B", "C"]);
        expect(other.workColumn("backlog")).toEqual(["B"]);
    });

    it("restores a deleted task to its held place", async () => {
        const c2 = fake.findTask("C2");
        await fake.handle("delete_task", { id: c2.id });
        expect(fake.workColumn("current")).toEqual(["C1"]);
        await fake.handle("restore_task", { id: c2.id });
        expect(fake.listOrder()).toEqual(["C1", "B1", "C2", "B2"]);
    });
});

describe("reopening seeded completed tasks", () => {
    it("returns each task to its held stage", async () => {
        const a = fake.seedTask({
            title: "A",
            stage: "done",
            heldStage: "current",
        });
        const b = fake.seedTask({ title: "B", stage: "done" });
        for (const task of [a, b]) {
            await fake.handle("set_task_completed", {
                id: task.id,
                completed: false,
            });
        }
        expect(fake.workColumn("current")).toEqual(["A"]);
        expect(fake.workColumn("icebox")).toEqual(["B"]);
    });
});

describe("the project and the initiative of a task", () => {
    it("gives a task the project of its initiative", async () => {
        const alpha = fake.seedProject("Alpha");
        const beta = fake.seedProject("Beta");
        const launch = fake.seedInitiative({ name: "Launch", project: beta });
        const task = (await fake.handle("create_task", {
            title: "  Write  ",
            description: "",
            projectId: alpha.id,
            initiativeId: launch.id,
        })) as StoredTask;
        expect(task).toMatchObject({
            title: "Write",
            projectId: beta.id,
            initiativeId: launch.id,
            rank: null,
        });
    });

    it("clears an initiative of another project and both for no project", async () => {
        const alpha = fake.seedProject("Alpha");
        const beta = fake.seedProject("Beta");
        const launch = fake.seedInitiative({ name: "Launch", project: alpha });
        const task = fake.seedTask({ title: "T", initiative: launch });
        expect(task.projectId).toBe(alpha.id);

        await fake.handle("set_task_project", {
            id: task.id,
            projectId: alpha.id,
        });
        expect(task.initiativeId).toBe(launch.id);
        await fake.handle("set_task_project", {
            id: task.id,
            projectId: beta.id,
        });
        expect(task).toMatchObject({ projectId: beta.id, initiativeId: null });
        await fake.handle("set_task_initiative", {
            id: task.id,
            initiativeId: launch.id,
        });
        expect(task.projectId).toBe(alpha.id);
        await fake.handle("set_task_initiative", {
            id: task.id,
            initiativeId: null,
        });
        expect(task).toMatchObject({ projectId: alpha.id, initiativeId: null });
        await fake.handle("set_task_project", { id: task.id, projectId: null });
        expect(task).toMatchObject({ projectId: null, initiativeId: null });
    });

    it("refuses a deleted project or initiative", async () => {
        const gone = fake.seedProject("Gone", { deleted: true });
        const alpha = fake.seedProject("Alpha");
        const old = fake.seedInitiative({
            name: "Old",
            project: alpha,
            deleted: true,
        });
        const task = fake.seedTask({ title: "T" });
        await expect(
            fake.handle("set_task_project", {
                id: task.id,
                projectId: gone.id,
            }),
        ).rejects.toBeDefined();
        await expect(
            fake.handle("set_task_initiative", {
                id: task.id,
                initiativeId: old.id,
            }),
        ).rejects.toBeDefined();
    });

    it("gives a meeting task the one initiative that the meeting covers", async () => {
        const alpha = fake.seedProject("Alpha");
        const launch = fake.seedInitiative({ name: "Launch", project: alpha });
        const other = fake.seedInitiative({ name: "Other", project: alpha });
        const one = fake.seedMeeting("One", [launch.id]);
        const two = fake.seedMeeting("Two", [launch.id, other.id]);
        const a = (await fake.handle("create_meeting_task", {
            meetingId: one.id,
            title: "A",
        })) as StoredTask;
        const b = (await fake.handle("create_meeting_task", {
            meetingId: two.id,
            title: "B",
        })) as StoredTask;
        expect(a).toMatchObject({
            projectId: alpha.id,
            initiativeId: launch.id,
        });
        expect(b).toMatchObject({ projectId: alpha.id, initiativeId: null });
    });

    it("moves the tasks of an initiative with it", async () => {
        const alpha = fake.seedProject("Alpha");
        const beta = fake.seedProject("Beta");
        const launch = fake.seedInitiative({ name: "Launch", project: alpha });
        const done = fake.seedTask({
            title: "Done",
            initiative: launch,
            stage: "done",
        });
        const gone = fake.seedTask({
            title: "Gone",
            initiative: launch,
            deleted: true,
        });
        await fake.handle("set_initiative_project", {
            id: launch.id,
            projectId: beta.id,
        });
        expect(done.projectId).toBe(beta.id);
        expect(gone.projectId).toBe(beta.id);
    });

    it("refuses to delete a project that still has a task", async () => {
        const alpha = fake.seedProject("Alpha");
        const task = fake.seedTask({
            title: "T",
            project: alpha,
            stage: "done",
        });
        expect(await fake.handle("delete_project", { id: alpha.id })).toEqual({
            status: "hasTasks",
        });
        await fake.handle("delete_task", { id: task.id });
        expect(await fake.handle("delete_project", { id: alpha.id })).toEqual({
            status: "deleted",
        });
    });
});

describe("the tasks of a meeting", () => {
    it("lists the tasks that are not deleted, oldest first", async () => {
        const meeting = fake.seedMeeting("M");
        fake.seedTask({ title: "First", meeting });
        fake.seedTask({ title: "Gone", meeting, deleted: true });
        fake.seedTask({ title: "Second", meeting, stage: "done" });
        const tasks = (await fake.handle("list_meeting_tasks", {
            meetingId: meeting.id,
        })) as StoredTask[];
        expect(tasks.map((t) => t.title)).toEqual(["First", "Second"]);
    });
});
