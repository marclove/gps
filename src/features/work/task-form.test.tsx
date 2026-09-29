import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { AUTOSAVE_DELAY_MS } from "@/hooks/use-autosave";
import type { InitiativeSummary } from "@/lib/initiatives";
import type { Project } from "@/lib/projects";
import type { Task } from "@/lib/tasks";
import { TaskForm, type TaskChoices } from "./task-form";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const TIME = "2026-09-01T10:00:00Z";

function project(id: number, name: string, deleted = false): Project {
    return {
        id,
        name,
        description: "",
        createdAt: TIME,
        updatedAt: TIME,
        deletedAt: deleted ? TIME : null,
    };
}

function initiative(
    id: number,
    name: string,
    projectId: number,
): InitiativeSummary {
    return {
        id,
        projectId,
        name,
        raciRole: null,
        horizon: "later",
        rank: "8",
        createdAt: TIME,
        updatedAt: TIME,
        completedAt: null,
        deletedAt: null,
    };
}

const CHECKOUT = project(1, "Checkout");
const BILLING = project(2, "Billing");
const LAUNCH = initiative(7, "Launch", CHECKOUT.id);

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

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation((command: string) =>
        Promise.reject(new Error(`Unexpected ${command}`)),
    );
    consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
});

function renderForm(
    shown: Task | null,
    choices: TaskChoices = {
        projects: [CHECKOUT, BILLING],
        initiatives: [LAUNCH],
    },
) {
    const onSaved = vi.fn();
    const onCreated = vi.fn();
    render(
        <MemoryRouter>
            <Toaster toastManager={toast}>
                <FailureToastProvider>
                    <TaskForm
                        task={shown}
                        choices={choices}
                        meeting={null}
                        onSaved={onSaved}
                        onCreated={onCreated}
                        onDelete={() => Promise.resolve()}
                        onClose={() => {}}
                    />
                </FailureToastProvider>
            </Toaster>
        </MemoryRouter>,
    );
    return { onSaved, onCreated };
}

function projectSelect() {
    return screen.getByRole<HTMLSelectElement>("combobox", { name: "Project" });
}

function initiativeSelect() {
    return screen.getByRole<HTMLSelectElement>("combobox", {
        name: "Initiative",
    });
}

function selectedText(select: HTMLSelectElement): string {
    return select.selectedOptions[0]?.text ?? "";
}

function optionTexts(select: HTMLSelectElement): string[] {
    return Array.from(select.options).map((option) => option.text);
}

describe("TaskForm", () => {
    it("saves a draft only after a real change", async () => {
        const user = userEvent.setup();
        renderForm(null);

        await user.type(
            screen.getByRole("textbox", { name: "Task title" }),
            "   ",
        );
        await act(
            () =>
                new Promise((resolve) =>
                    setTimeout(resolve, AUTOSAVE_DELAY_MS + 100),
                ),
        );

        expect(invoke).not.toHaveBeenCalled();
    });

    it("saves the project at once and shows the answer of the backend", async () => {
        const answer = task({ projectId: BILLING.id, initiativeId: null });
        invoke.mockImplementation((command: string) =>
            command === "set_task_project"
                ? Promise.resolve(answer)
                : Promise.reject(new Error(`Unexpected ${command}`)),
        );
        const user = userEvent.setup();
        const { onSaved } = renderForm(
            task({ projectId: CHECKOUT.id, initiativeId: LAUNCH.id }),
        );
        expect(selectedText(initiativeSelect())).toBe("Launch");

        await user.selectOptions(projectSelect(), "Billing");

        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(answer));
        expect(invoke).toHaveBeenCalledWith("set_task_project", {
            id: 5,
            projectId: BILLING.id,
        });
        expect(selectedText(projectSelect())).toBe("Billing");
        expect(selectedText(initiativeSelect())).toBe("No initiative");
        expect(optionTexts(initiativeSelect())).toEqual(["No initiative"]);
    });

    it("puts the select back and shows a toast when the project cannot be saved", async () => {
        const user = userEvent.setup();
        const { onSaved } = renderForm(task({ projectId: CHECKOUT.id }));

        await user.selectOptions(projectSelect(), "Billing");

        expect(
            await within(
                screen.getByRole("region", { name: "Notifications" }),
            ).findByText("Couldn't change the project. Try again."),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(selectedText(projectSelect())).toBe("Checkout"),
        );
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('shows a deleted project as a selected choice with " (deleted)"', () => {
        const old = project(3, "Old", true);
        renderForm(task({ projectId: old.id }), {
            projects: [CHECKOUT, old, BILLING, project(4, "Gone", true)],
            initiatives: [],
        });

        expect(optionTexts(projectSelect())).toEqual([
            "No project",
            "Billing",
            "Checkout",
            "Old (deleted)",
        ]);
        expect(selectedText(projectSelect())).toBe("Old (deleted)");
    });

    it("disables Initiative without a project", () => {
        renderForm(task());

        expect(initiativeSelect()).toBeDisabled();
        expect(selectedText(initiativeSelect())).toBe("No initiative");
    });
});
