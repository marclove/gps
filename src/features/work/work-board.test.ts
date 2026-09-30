import { describe, expect, it } from "vitest";
import type { Task, TaskStage } from "@/lib/tasks";
import {
    buildWorkBoard,
    placeTask,
    replaceTask,
    WORK_COLUMNS,
} from "./work-board";

let nextId = 1;

function task(fields: Partial<Task> & { title: string }): Task {
    return {
        id: nextId++,
        meetingId: null,
        description: "",
        projectId: null,
        initiativeId: null,
        rank: null,
        createdAt: "2026-09-20T10:00:00.000Z",
        updatedAt: "2026-09-20T10:00:00.000Z",
        startedAt: null,
        completedAt: null,
        deletedAt: null,
        ...fields,
    };
}

function titles(board: Record<TaskStage, Task[]>) {
    return {
        current: board.current.map((t) => t.title),
        backlog: board.backlog.map((t) => t.title),
        icebox: board.icebox.map((t) => t.title),
        done: board.done.map((t) => t.title),
    };
}

const STARTED = "2026-09-21T10:00:00.000Z";

describe("work board", () => {
    it("buildWorkBoard sorts each column", () => {
        const board = buildWorkBoard([
            task({ title: "C2", rank: "8", startedAt: STARTED }),
            task({ title: "B2", rank: "c" }),
            task({ title: "C1", rank: "4", startedAt: STARTED }),
            task({ title: "B1", rank: "81f" }),
            task({ title: "Old", createdAt: "2026-09-01T10:00:00.000Z" }),
            task({ title: "New", createdAt: "2026-09-28T10:00:00.000Z" }),
            task({
                title: "Done first",
                rank: "2",
                completedAt: "2026-09-20T10:00:00.000Z",
            }),
            task({
                title: "Done last",
                completedAt: "2026-09-25T10:00:00.000Z",
            }),
        ]);

        expect(titles(board)).toEqual({
            current: ["C1", "C2"],
            backlog: ["B1", "B2"],
            icebox: ["New", "Old"],
            done: ["Done last", "Done first"],
        });
    });

    it("placeTask puts a started task among Current at its rank", () => {
        const b = task({ title: "B", rank: "6" });
        const board = buildWorkBoard([
            task({ title: "A", rank: "4", startedAt: STARTED }),
            b,
            task({ title: "C", rank: "8", startedAt: STARTED }),
        ]);

        const placed = placeTask(board, { ...b, startedAt: STARTED });

        expect(titles(placed)).toEqual({
            current: ["A", "B", "C"],
            backlog: [],
            icebox: [],
            done: [],
        });
    });

    it("placeTask puts a reopened task without rank at its created place in the Icebox", () => {
        const x = task({
            title: "X",
            createdAt: "2026-09-10T10:00:00.000Z",
            completedAt: "2026-09-25T10:00:00.000Z",
        });
        const board = buildWorkBoard([
            task({ title: "Old", createdAt: "2026-09-01T10:00:00.000Z" }),
            x,
            task({ title: "New", createdAt: "2026-09-28T10:00:00.000Z" }),
        ]);

        const placed = placeTask(board, { ...x, completedAt: null });

        expect(titles(placed).icebox).toEqual(["New", "X", "Old"]);
        expect(placed.done).toEqual([]);
    });

    it("replaceTask keeps the place", () => {
        const b = task({ title: "B", rank: "6" });
        const board = buildWorkBoard([
            task({ title: "A", rank: "4" }),
            b,
            task({ title: "C", rank: "8" }),
        ]);

        // A rank that sorts first, and a new title, as after a move or a save.
        const replaced = replaceTask(board, { ...b, title: "B2", rank: "1" });

        expect(titles(replaced).backlog).toEqual(["A", "B2", "C"]);
        expect(replaced.backlog[1].rank).toBe("1");
    });

    it("gives the sorted place of a card in the Icebox and at the top of Done", () => {
        const icebox = WORK_COLUMNS.find((column) => column.id === "icebox")!;
        const done = WORK_COLUMNS.find((column) => column.id === "done")!;
        const moved = task({
            title: "M",
            rank: "4",
            createdAt: "2026-09-10T10:00:00.000Z",
        });
        const others = [
            task({ title: "New", createdAt: "2026-09-28T10:00:00.000Z" }),
            task({ title: "Old", createdAt: "2026-09-01T10:00:00.000Z" }),
        ];

        expect(icebox.sortedIndex!(moved, others)).toBe(1);
        expect(done.sortedIndex!(moved, others)).toBe(0);
        expect(
            WORK_COLUMNS.map(({ id, ordered, draggable }) => ({
                id,
                ordered,
                draggable,
            })),
        ).toEqual([
            { id: "current", ordered: true, draggable: true },
            { id: "backlog", ordered: true, draggable: true },
            { id: "icebox", ordered: false, draggable: true },
            { id: "done", ordered: false, draggable: false },
        ]);
    });
});
