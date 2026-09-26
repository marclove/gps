import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/tasks";
import { ActionItemsPanel } from "./action-items-panel";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function task(id: number, description: string): Task {
    return {
        id,
        meetingId: 1,
        description,
        createdAt: "2026-09-24T10:00:00.000Z",
        updatedAt: "2026-09-24T10:00:00.000Z",
        completedAt: null,
    };
}

/** Answers the task commands. `create` answers `create_task`. */
function answer({
    tasks = [],
    create = (description: string) => Promise.resolve(task(99, description)),
}: {
    tasks?: Task[];
    create?: (description: string) => Promise<Task>;
} = {}) {
    invoke.mockImplementation(
        async (command: string, args: Record<string, unknown> = {}) => {
            switch (command) {
                case "list_meeting_tasks":
                    return tasks;
                case "create_task":
                    return create(args.description as string);
                default:
                    throw `unexpected command ${command}`;
            }
        },
    );
}

function addField() {
    return screen.getByRole("textbox", { name: "Add action item" });
}

function itemValues() {
    return screen
        .queryAllByRole("textbox", { name: "Action item" })
        .map((field) => (field as HTMLInputElement).value);
}

function createCalls() {
    return invoke.mock.calls.filter(([command]) => command === "create_task");
}

beforeEach(() => {
    invoke.mockReset();
});

describe("ActionItemsPanel", () => {
    it("loads the tasks of its meeting", async () => {
        answer({ tasks: [task(1, "Send the deck"), task(2, "Call Sam")] });
        render(<ActionItemsPanel meetingId={1} />);

        expect(screen.getByText("Loading…")).toBeInTheDocument();
        await waitFor(() =>
            expect(itemValues()).toEqual(["Send the deck", "Call Sam"]),
        );
        expect(invoke).toHaveBeenCalledWith("list_meeting_tasks", {
            meetingId: 1,
        });
    });

    it("says that there are no action items", async () => {
        answer();
        render(<ActionItemsPanel meetingId={1} />);

        expect(
            await screen.findByText("No action items yet"),
        ).toBeInTheDocument();
    });

    it("reports a failed load and loads again on Retry", async () => {
        invoke.mockRejectedValueOnce("database is locked");
        const user = userEvent.setup();
        render(<ActionItemsPanel meetingId={1} />);

        expect(
            await screen.findByText("Couldn't load action items"),
        ).toBeInTheDocument();

        answer({ tasks: [task(1, "Send the deck")] });
        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(itemValues()).toEqual(["Send the deck"]));
    });

    it("adds two items typed quickly, in order, and ends with an empty field", async () => {
        const pending: ((task: Task) => void)[] = [];
        answer({
            create: () => new Promise<Task>((resolve) => pending.push(resolve)),
        });
        const user = userEvent.setup();
        render(<ActionItemsPanel meetingId={1} />);
        await screen.findByText("No action items yet");

        await user.click(addField());
        await user.keyboard("First{Enter}Second{Enter}");
        expect(createCalls()).toEqual([
            ["create_task", { meetingId: 1, description: "First" }],
            ["create_task", { meetingId: 1, description: "Second" }],
        ]);

        pending[0](task(1, "First"));
        await waitFor(() => expect(itemValues()).toEqual(["First"]));
        pending[1](task(2, "Second"));

        await waitFor(() => expect(itemValues()).toEqual(["First", "Second"]));
        expect(addField()).toHaveValue("");
    });

    it("does not add an item on Enter that confirms an input method composition", async () => {
        answer();
        render(<ActionItemsPanel meetingId={1} />);
        await screen.findByText("No action items yet");

        fireEvent.change(addField(), { target: { value: "にほん" } });
        fireEvent.keyDown(addField(), { key: "Enter", isComposing: true });

        expect(createCalls()).toEqual([]);
        expect(addField()).toHaveValue("にほん");
    });

    it("keeps the text and reports the problem when adding fails", async () => {
        answer({ create: () => Promise.reject("database is locked") });
        const user = userEvent.setup();
        render(<ActionItemsPanel meetingId={1} />);
        await screen.findByText("No action items yet");

        await user.click(addField());
        await user.keyboard("Call Sam{Enter}");

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Couldn't add the action item. Try again.",
        );
        expect(addField()).toHaveValue("Call Sam");
        expect(itemValues()).toEqual([]);
    });

    it("does not put the text back after a failed add when the user typed again", async () => {
        let reject: (reason: unknown) => void = () => {};
        answer({
            create: () =>
                new Promise<Task>((_, rejectCreate) => {
                    reject = rejectCreate;
                }),
        });
        const user = userEvent.setup();
        render(<ActionItemsPanel meetingId={1} />);
        await screen.findByText("No action items yet");

        await user.click(addField());
        await user.keyboard("Call Sam{Enter}Book");
        reject("database is locked");

        await screen.findByRole("alert");
        expect(addField()).toHaveValue("Book");
    });
});
