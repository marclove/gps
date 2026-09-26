import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
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

/**
 * Answers the task commands. `create` answers `create_task`, `complete` answers
 * `set_task_completed`, `update` answers `update_task_description`, and `remove`
 * answers `delete_task`.
 */
function answer({
    tasks = [],
    create = (description: string) => Promise.resolve(task(99, description)),
    complete = (id: number) =>
        Promise.resolve(tasks.find((stored) => stored.id === id) as Task),
    update = (id: number, description: string) =>
        Promise.resolve(task(id, description)),
    remove = () => Promise.resolve(),
}: {
    tasks?: Task[];
    create?: (description: string) => Promise<Task>;
    complete?: (id: number, completed: boolean) => Promise<Task>;
    update?: (id: number, description: string) => Promise<Task>;
    remove?: (id: number) => Promise<void>;
} = {}) {
    invoke.mockImplementation(
        async (command: string, args: Record<string, unknown> = {}) => {
            switch (command) {
                case "list_meeting_tasks":
                    return tasks;
                case "create_task":
                    return create(args.description as string);
                case "set_task_completed":
                    return complete(
                        args.id as number,
                        args.completed as boolean,
                    );
                case "update_task_description":
                    return update(
                        args.id as number,
                        args.description as string,
                    );
                case "delete_task":
                    return remove(args.id as number);
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

function completeCalls() {
    return invoke.mock.calls.filter(
        ([command]) => command === "set_task_completed",
    );
}

function updateCalls() {
    return invoke.mock.calls.filter(
        ([command]) => command === "update_task_description",
    );
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

    it("ends unchecked after a quick check and uncheck", async () => {
        let stored = task(1, "Send the deck");
        const pending: (() => void)[] = [];
        answer({
            tasks: [stored],
            complete: (_id, completed) => {
                // The fake stores the change at once and answers when the test says so.
                stored = {
                    ...stored,
                    completedAt: completed ? "2026-09-24T11:00:00.000Z" : null,
                };
                const answerTask = stored;
                return new Promise<Task>((resolve) =>
                    pending.push(() => resolve(answerTask)),
                );
            },
        });
        const user = userEvent.setup();
        render(<ActionItemsPanel meetingId={1} />);

        const checkbox = await screen.findByRole("checkbox", {
            name: 'Complete "Send the deck"',
        });
        await user.click(checkbox);
        await user.click(checkbox);
        expect(pending).toHaveLength(2);
        await act(async () => {
            pending[0]();
            pending[1]();
        });

        expect(checkbox).not.toBeChecked();
        const calls = completeCalls();
        expect(calls[calls.length - 1]).toEqual([
            "set_task_completed",
            { id: 1, completed: false },
        ]);
    });

    /**
     * Answers `set_task_completed` by hand. Each call gets the task as the fake stores it
     * at that call, and waits until the test resolves or rejects it.
     */
    function answerCompleteByHand() {
        let stored = task(1, "Send the deck");
        const calls: {
            resolve: () => void;
            reject: (reason: unknown) => void;
        }[] = [];
        answer({
            tasks: [stored],
            complete: (_id, completed) => {
                stored = {
                    ...stored,
                    completedAt: completed ? "2026-09-24T11:00:00.000Z" : null,
                };
                const answerTask = stored;
                return new Promise<Task>((resolve, reject) =>
                    calls.push({ resolve: () => resolve(answerTask), reject }),
                );
            },
        });
        return calls;
    }

    async function clickTwice() {
        const user = userEvent.setup();
        render(<ActionItemsPanel meetingId={1} />);
        const checkbox = await screen.findByRole("checkbox", {
            name: 'Complete "Send the deck"',
        });
        await user.click(checkbox);
        await user.click(checkbox);
        return checkbox;
    }

    it("ends unchecked when the answer to the check comes after the answer to the uncheck", async () => {
        const calls = answerCompleteByHand();
        const checkbox = await clickTwice();

        expect(calls).toHaveLength(2);
        await act(async () => calls[1].resolve());
        await act(async () => calls[0].resolve());

        expect(checkbox).not.toBeChecked();
    });

    it("ends unchecked when the check fails after the uncheck was saved", async () => {
        const calls = answerCompleteByHand();
        const checkbox = await clickTwice();

        expect(calls).toHaveLength(2);
        await act(async () => calls[1].resolve());
        await act(async () => calls[0].reject("database is locked"));

        expect(checkbox).not.toBeChecked();
    });

    it("shows the saved value when a check and an uncheck both fail", async () => {
        const calls = answerCompleteByHand();
        const checkbox = await clickTwice();

        expect(calls).toHaveLength(2);
        await act(async () => calls[0].reject("database is locked"));
        await act(async () => calls[1].reject("database is locked"));

        expect(checkbox).not.toBeChecked();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Couldn't save the action item. Try again.",
        );
    });

    it("keeps the typed text when the item is checked before the text is saved", async () => {
        // The answer to the check has the description that was stored before the change.
        answer({ tasks: [task(1, "Send the deck")] });
        const user = userEvent.setup();
        render(<ActionItemsPanel meetingId={1} />);
        const checkbox = await screen.findByRole("checkbox", {
            name: 'Complete "Send the deck"',
        });
        const field = screen.getByRole("textbox", { name: "Action item" });

        await user.click(field);
        await user.keyboard("{End} to Alex");
        await user.click(checkbox);

        await waitFor(() => expect(completeCalls()).toHaveLength(1));
        expect(field).toHaveValue("Send the deck to Alex");
        await waitFor(() =>
            expect(updateCalls()).toEqual([
                [
                    "update_task_description",
                    { id: 1, description: "Send the deck to Alex" },
                ],
            ]),
        );
        expect(field).toHaveValue("Send the deck to Alex");
    });

    it("saves the edited text when the removal fails", async () => {
        answer({
            tasks: [task(1, "Send the deck"), task(2, "Book a room")],
            remove: () => Promise.reject("database is locked"),
        });
        const user = userEvent.setup();
        render(<ActionItemsPanel meetingId={1} />);
        await waitFor(() =>
            expect(itemValues()).toEqual(["Send the deck", "Book a room"]),
        );

        await user.click(
            screen.getAllByRole("textbox", { name: "Action item" })[1],
        );
        await user.keyboard("{End} for Friday");
        await user.click(
            screen.getByRole("button", {
                name: 'Remove "Book a room for Friday"',
            }),
        );

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Couldn't remove the action item. Try again.",
        );
        await waitFor(
            () =>
                expect(updateCalls()).toEqual([
                    [
                        "update_task_description",
                        { id: 2, description: "Book a room for Friday" },
                    ],
                ]),
            { timeout: 2000 },
        );
    });

    it("reports each failed save of the text, also when the failures follow each other quickly", async () => {
        answer({
            tasks: [task(1, "Send the deck")],
            update: () => Promise.reject("database is locked"),
        });
        const user = userEvent.setup();
        render(<ActionItemsPanel meetingId={1} />);
        const checkbox = await screen.findByRole("checkbox", {
            name: 'Complete "Send the deck"',
        });
        const field = screen.getByRole("textbox", { name: "Action item" });

        await user.click(field);
        await user.keyboard("{End} to Alex");
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Couldn't save the action item. Try again.",
        );

        await user.click(checkbox);
        await waitFor(() =>
            expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
        );

        await user.click(field);
        await user.keyboard("!");
        await waitFor(() => expect(updateCalls()).toHaveLength(2));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Couldn't save the action item. Try again.",
        );
    });
});
