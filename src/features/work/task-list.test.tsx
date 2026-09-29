import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteProvider } from "@/components/delete-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import type { Task } from "@/lib/tasks";
import { TaskList } from "./task-list";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const CHECKOUT = 2;
const BILLING = 3;

function task(id: number, title: string, fields: Partial<Task> = {}): Task {
    return {
        id,
        meetingId: null,
        title,
        description: "",
        projectId: CHECKOUT,
        initiativeId: null,
        rank: null,
        createdAt: `2026-09-01T10:00:0${id}Z`,
        updatedAt: "2026-09-01T10:00:00Z",
        startedAt: null,
        completedAt: null,
        deletedAt: null,
        ...fields,
    };
}

/** The tasks that `list_tasks` returns. */
let tasks: Task[];

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation((command: string) =>
        command === "list_tasks"
            ? Promise.resolve(tasks)
            : Promise.reject(new Error(`Unexpected ${command}`)),
    );
    consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
});

const inCheckout = (candidate: Task) => candidate.projectId === CHECKOUT;

function renderList(savedTask?: Task) {
    const onOpen = vi.fn();
    const list = (saved?: Task) => (
        <Toaster toastManager={toast}>
            <DeleteProvider>
                <TaskList
                    filter={inCheckout}
                    onOpen={onOpen}
                    savedTask={saved}
                />
            </DeleteProvider>
        </Toaster>
    );
    const view = render(list(savedTask));
    return {
        onOpen,
        showSaved: (saved: Task) => view.rerender(list(saved)),
    };
}

function rows(): string[] {
    return within(screen.getByRole("region", { name: "Tasks" }))
        .queryAllByRole("button")
        .map((row) => row.textContent ?? "");
}

describe("TaskList", () => {
    it("orders Current, Backlog, then Icebox", async () => {
        tasks = [
            task(1, "Old idea"),
            task(2, "Second", { rank: "b" }),
            task(3, "Doing", { rank: "c", startedAt: "2026-09-02T10:00:00Z" }),
            task(4, "First", { rank: "a" }),
            task(5, "New idea"),
            task(6, "Other project", { projectId: BILLING }),
        ];
        renderList();

        await waitFor(() =>
            expect(rows()).toEqual([
                "Doing",
                "First",
                "Second",
                "New idea",
                "Old idea",
            ]),
        );
    });

    it("leaves out completed tasks", async () => {
        tasks = [
            task(1, "Open"),
            task(2, "Finished", {
                rank: "a",
                completedAt: "2026-09-03T10:00:00Z",
            }),
        ];
        renderList();

        await waitFor(() => expect(rows()).toEqual(["Open"]));
    });

    it("says No tasks when no task matches", async () => {
        tasks = [task(1, "Other project", { projectId: BILLING })];
        renderList();

        expect(await screen.findByText("No tasks")).toBeInTheDocument();
        expect(rows()).toEqual([]);
    });

    it("opens a row with the identifier and the title of its task", async () => {
        tasks = [task(1, "Send the deck"), task(2, "")];
        const user = userEvent.setup();
        const { onOpen } = renderList();

        await user.click(
            await screen.findByRole("button", { name: "Untitled task" }),
        );
        expect(onOpen).toHaveBeenLastCalledWith(2, "");
        await user.click(screen.getByRole("button", { name: "Send the deck" }));
        expect(onOpen).toHaveBeenLastCalledWith(1, "Send the deck");
    });

    it("shows the new title of a saved task in its row", async () => {
        const deck = task(1, "Send the deck");
        tasks = [deck, task(2, "Other")];
        const { showSaved } = renderList();
        await waitFor(() => expect(rows()).toEqual(["Other", "Send the deck"]));

        showSaved({ ...deck, title: "Send the deck today" });

        expect(rows()).toEqual(["Other", "Send the deck today"]);
    });

    it("removes a row whose saved task moved to another project", async () => {
        const deck = task(1, "Send the deck");
        tasks = [deck, task(2, "Other")];
        const { showSaved } = renderList();
        await waitFor(() => expect(rows()).toEqual(["Other", "Send the deck"]));

        showSaved({ ...deck, projectId: BILLING });

        expect(rows()).toEqual(["Other"]);
    });
});
