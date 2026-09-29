import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteProvider } from "@/components/delete-provider";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import type { Task } from "@/lib/tasks";
import { useTaskSheet } from "./use-task-sheet";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

/** Autosave waits for a pause, so a save can take longer than the default timeout. */
const SAVE_TIMEOUT = { timeout: 2000 };

const TIME = "2026-09-01T10:00:00Z";

function task(fields: Partial<Task> = {}): Task {
    return {
        id: 5,
        meetingId: null,
        title: "Plan",
        description: "",
        projectId: null,
        initiativeId: null,
        rank: null,
        createdAt: TIME,
        updatedAt: TIME,
        startedAt: null,
        completedAt: null,
        deletedAt: null,
        ...fields,
    };
}

/** The task that the mock backend stores. */
let stored: Task | null;

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    stored = task();
    invoke.mockReset();
    invoke.mockImplementation(
        (command: string, args: Record<string, unknown>) => {
            switch (command) {
                case "list_projects":
                case "list_initiatives":
                    return Promise.resolve([]);
                case "get_task":
                    return Promise.resolve(stored);
                case "create_task":
                    stored = task({
                        id: 9,
                        title: String(args.title).trim(),
                    });
                    return Promise.resolve(stored);
                case "update_task_title":
                    stored = { ...stored!, title: String(args.title).trim() };
                    return Promise.resolve(stored);
            }
            return Promise.reject(new Error(`Unexpected ${command}`));
        },
    );
    consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
});

function Page({
    onSaved,
    onCreated,
}: {
    onSaved: (task: Task) => void;
    onCreated: (task: Task) => void;
}) {
    const { openTask, openDraft, sheet } = useTaskSheet({
        onSaved,
        onCreated,
    });
    return (
        <>
            <button onClick={() => openTask(5, "Plan")}>Open Plan</button>
            <button onClick={openDraft}>New task</button>
            {sheet}
        </>
    );
}

function renderPage() {
    const onSaved = vi.fn();
    const onCreated = vi.fn();
    render(
        <MemoryRouter>
            <Toaster toastManager={toast}>
                <FailureToastProvider>
                    <DeleteProvider>
                        <Page onSaved={onSaved} onCreated={onCreated} />
                    </DeleteProvider>
                </FailureToastProvider>
            </Toaster>
        </MemoryRouter>,
    );
    return { onSaved, onCreated };
}

function titleField() {
    return screen.getByRole("textbox", { name: "Task title" });
}

describe("useTaskSheet", () => {
    it("calls onSaved with each saved task", async () => {
        const user = userEvent.setup();
        const { onSaved } = renderPage();
        await user.click(screen.getByRole("button", { name: "Open Plan" }));
        await waitFor(() => expect(titleField()).toBeEnabled());

        await user.type(titleField(), "!");
        await waitFor(
            () =>
                expect(onSaved).toHaveBeenLastCalledWith(
                    task({ title: "Plan!" }),
                ),
            SAVE_TIMEOUT,
        );
        await user.type(titleField(), "?");

        await waitFor(
            () =>
                expect(onSaved).toHaveBeenLastCalledWith(
                    task({ title: "Plan!?" }),
                ),
            SAVE_TIMEOUT,
        );
        expect(onSaved).toHaveBeenCalledTimes(2);
        expect(
            await screen.findByRole("dialog", { name: "Plan!?" }),
        ).toBeInTheDocument();
    });

    it("calls onCreated once when a draft is saved", async () => {
        const user = userEvent.setup();
        const { onCreated, onSaved } = renderPage();
        await user.click(screen.getByRole("button", { name: "New task" }));
        await waitFor(() => expect(titleField()).toHaveFocus());

        await user.type(titleField(), "Fresh");
        await waitFor(
            () =>
                expect(onCreated).toHaveBeenCalledWith(
                    task({ id: 9, title: "Fresh" }),
                ),
            SAVE_TIMEOUT,
        );
        await user.type(titleField(), " idea");

        await waitFor(
            () =>
                expect(onSaved).toHaveBeenLastCalledWith(
                    task({ id: 9, title: "Fresh idea" }),
                ),
            SAVE_TIMEOUT,
        );
        expect(onCreated).toHaveBeenCalledTimes(1);
        expect(
            invoke.mock.calls.filter(([command]) => command === "create_task"),
        ).toHaveLength(1);
        expect(
            screen.getByRole("dialog", { name: "Fresh idea" }),
        ).toBeInTheDocument();
    });
});
