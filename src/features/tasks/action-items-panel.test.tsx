import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteProvider } from "@/components/delete-provider";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import type { Task } from "@/lib/tasks";
import { ActionItemsPanel } from "./action-items-panel";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function task(id: number, title: string): Task {
    return {
        id,
        meetingId: 1,
        title,
        description: "",
        projectId: null,
        initiativeId: null,
        rank: null,
        createdAt: "2026-09-24T10:00:00.000Z",
        updatedAt: "2026-09-24T10:00:00.000Z",
        startedAt: null,
        completedAt: null,
        deletedAt: null,
    };
}

/**
 * Answers the task commands. `create` answers `create_meeting_task`, `complete` answers
 * `set_task_completed`, `update` answers `update_task_title`, and `remove`
 * answers `delete_task`. `list_meeting_tasks` answers the tasks that are not deleted, in
 * the order of `tasks`. A delete that succeeds marks the task as deleted, `restore_task`
 * brings it back, and an update that succeeds stores the new title.
 */
function answer({
    tasks = [],
    create = (title: string) => Promise.resolve(task(99, title)),
    complete = (id: number) =>
        Promise.resolve(tasks.find((stored) => stored.id === id) as Task),
    update = (id: number, title: string) => Promise.resolve(task(id, title)),
    remove = () => Promise.resolve(),
}: {
    tasks?: Task[];
    create?: (title: string) => Promise<Task>;
    complete?: (id: number, completed: boolean) => Promise<Task>;
    update?: (id: number, title: string) => Promise<Task>;
    remove?: (id: number) => Promise<void>;
} = {}) {
    let stored = tasks;
    const deleted = new Set<number>();
    invoke.mockImplementation(
        async (command: string, args: Record<string, unknown> = {}) => {
            const id = args.id as number;
            switch (command) {
                case "list_meeting_tasks":
                    return stored.filter((each) => !deleted.has(each.id));
                case "create_meeting_task":
                    return create(args.title as string);
                case "set_task_completed":
                    return complete(id, args.completed as boolean);
                case "update_task_title": {
                    const updated = await update(id, args.title as string);
                    stored = stored.map((each) =>
                        each.id === id ? updated : each,
                    );
                    return updated;
                }
                case "delete_task":
                    await remove(id);
                    deleted.add(id);
                    return null;
                case "restore_task":
                    deleted.delete(id);
                    return null;
                default:
                    throw `unexpected command ${command}`;
            }
        },
    );
}

/**
 * Renders the panel inside the providers of the toasts that report its failures and of
 * the delete action. `onOpen` gets the calls of the Open buttons. `rerender` gives the
 * panel the task that the sheet saved last.
 */
function renderPanel(onOpen: (id: number, title: string) => void = () => {}) {
    const panel = (savedTask?: Task) => (
        <Toaster toastManager={toast}>
            <FailureToastProvider>
                <DeleteProvider>
                    <ActionItemsPanel
                        meetingId={1}
                        onOpen={onOpen}
                        savedTask={savedTask}
                    />
                </DeleteProvider>
            </FailureToastProvider>
        </Toaster>
    );
    const { rerender } = render(panel());
    return {
        rerender: (savedTask: Task) => rerender(panel(savedTask)),
    };
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

/** The texts of the failure toasts that are open. */
function failureToasts(): string[] {
    return within(screen.getByRole("region", { name: "Notifications" }))
        .queryAllByText(/^Couldn't .* Try again\.$/)
        .map((element) => element.textContent ?? "");
}

/** Waits until the only failure toast says `text`. */
async function findFailureToast(text: string) {
    await waitFor(() => expect(failureToasts()).toEqual([text]));
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
        ([command]) => command === "update_task_title",
    );
}

function createCalls() {
    return invoke.mock.calls.filter(
        ([command]) => command === "create_meeting_task",
    );
}

beforeEach(() => {
    invoke.mockReset();
});

describe("ActionItemsPanel", () => {
    it("loads the tasks of its meeting", async () => {
        answer({ tasks: [task(1, "Send the deck"), task(2, "Call Sam")] });
        renderPanel();

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
        renderPanel();

        expect(
            await screen.findByText("No action items yet"),
        ).toBeInTheDocument();
    });

    it("reports a failed load and loads again on Retry", async () => {
        invoke.mockRejectedValueOnce("database is locked");
        const user = userEvent.setup();
        renderPanel();

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
        renderPanel();
        await screen.findByText("No action items yet");

        await user.click(addField());
        await user.keyboard("First{Enter}Second{Enter}");
        expect(createCalls()).toEqual([
            ["create_meeting_task", { meetingId: 1, title: "First" }],
            ["create_meeting_task", { meetingId: 1, title: "Second" }],
        ]);

        pending[0](task(1, "First"));
        await waitFor(() => expect(itemValues()).toEqual(["First"]));
        pending[1](task(2, "Second"));

        await waitFor(() => expect(itemValues()).toEqual(["First", "Second"]));
        expect(addField()).toHaveValue("");
    });

    it("does not add an item on Enter that confirms an input method composition", async () => {
        answer();
        renderPanel();
        await screen.findByText("No action items yet");

        fireEvent.change(addField(), { target: { value: "にほん" } });
        fireEvent.keyDown(addField(), { key: "Enter", isComposing: true });

        expect(createCalls()).toEqual([]);
        expect(addField()).toHaveValue("にほん");
    });

    it("does not add an item on the Enter that WebKit sends after an input method composition ends", async () => {
        answer();
        renderPanel();
        await screen.findByText("No action items yet");

        fireEvent.change(addField(), { target: { value: "にほん" } });
        fireEvent.keyDown(addField(), {
            key: "Enter",
            keyCode: 229,
            isComposing: false,
        });

        expect(createCalls()).toEqual([]);
        expect(addField()).toHaveValue("にほん");
    });

    it("keeps the text and reports the problem when adding fails", async () => {
        answer({ create: () => Promise.reject("database is locked") });
        const user = userEvent.setup();
        renderPanel();
        await screen.findByText("No action items yet");

        await user.click(addField());
        await user.keyboard("Call Sam{Enter}");

        await findFailureToast("Couldn't add the action item. Try again.");
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
        renderPanel();
        await screen.findByText("No action items yet");

        await user.click(addField());
        await user.keyboard("Call Sam{Enter}Book");
        reject("database is locked");

        await findFailureToast("Couldn't add the action item. Try again.");
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
        renderPanel();

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
        renderPanel();
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
        await findFailureToast("Couldn't save the action item. Try again.");
    });

    it("keeps the typed text when the item is checked before the text is saved", async () => {
        // The answer to the check has the title that was stored before the change.
        answer({ tasks: [task(1, "Send the deck")] });
        const user = userEvent.setup();
        renderPanel();
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
                    "update_task_title",
                    { id: 1, title: "Send the deck to Alex" },
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
        renderPanel();
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

        await findFailureToast("Couldn't remove the action item. Try again.");
        await waitFor(
            () =>
                expect(updateCalls()).toEqual([
                    [
                        "update_task_title",
                        { id: 2, title: "Book a room for Friday" },
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
        renderPanel();
        const checkbox = await screen.findByRole("checkbox", {
            name: 'Complete "Send the deck"',
        });
        const field = screen.getByRole("textbox", { name: "Action item" });

        await user.click(field);
        await user.keyboard("{End} to Alex");
        await findFailureToast("Couldn't save the action item. Try again.");

        await user.click(checkbox);
        await waitFor(() => expect(failureToasts()).toEqual([]));

        await user.click(field);
        await user.keyboard("!");
        await waitFor(() => expect(updateCalls()).toHaveLength(2));
        await findFailureToast("Couldn't save the action item. Try again.");
    });

    it("deletes once and reports nothing when the remove button is clicked twice quickly", async () => {
        let resolveDelete: () => void = () => {};
        answer({
            tasks: [task(1, "Send the deck"), task(2, "Book a room")],
            remove: () =>
                new Promise<void>((resolve) => {
                    resolveDelete = resolve;
                }),
        });
        const user = userEvent.setup();
        renderPanel();
        await waitFor(() =>
            expect(itemValues()).toEqual(["Send the deck", "Book a room"]),
        );

        await user.click(
            screen.getAllByRole("textbox", { name: "Action item" })[1],
        );
        await user.keyboard("{End} for Friday");
        const button = screen.getByRole("button", {
            name: 'Remove "Book a room for Friday"',
        });
        await user.click(button);
        await user.click(button);
        await act(async () => resolveDelete());

        await waitFor(() => expect(itemValues()).toEqual(["Send the deck"]));
        // Wait longer than the pause before an automatic save.
        await new Promise((resolve) => setTimeout(resolve, 800));
        expect(
            invoke.mock.calls.filter(([command]) => command === "delete_task"),
        ).toEqual([["delete_task", { id: 2 }]]);
        expect(updateCalls()).toEqual([]);
        expect(failureToasts()).toEqual([]);
    });

    it("reports nothing when a check fails after its item was removed", async () => {
        const calls = answerCompleteByHand();
        const user = userEvent.setup();
        renderPanel();
        await user.click(
            await screen.findByRole("checkbox", {
                name: 'Complete "Send the deck"',
            }),
        );
        expect(calls).toHaveLength(1);

        await user.click(
            screen.getByRole("button", { name: 'Remove "Send the deck"' }),
        );
        await screen.findByText("No action items yet");
        await act(async () => calls[0].reject("database is locked"));

        expect(failureToasts()).toEqual([]);
    });
    it("saves a waiting text change before it opens the sheet", async () => {
        let resolveUpdate: () => void = () => {};
        answer({
            tasks: [task(1, "Send the deck")],
            update: (id, title) =>
                new Promise<Task>((resolve) => {
                    resolveUpdate = () => resolve(task(id, title));
                }),
        });
        const onOpen = vi.fn();
        const user = userEvent.setup();
        renderPanel(onOpen);
        const field = await screen.findByRole("textbox", {
            name: "Action item",
        });

        await user.click(field);
        await user.keyboard("{End} to Alex");
        await user.click(
            screen.getByRole("button", {
                name: 'Open "Send the deck to Alex"',
            }),
        );

        expect(updateCalls()).toEqual([
            ["update_task_title", { id: 1, title: "Send the deck to Alex" }],
        ]);
        expect(onOpen).not.toHaveBeenCalled();
        await act(async () => resolveUpdate());
        await waitFor(() =>
            expect(onOpen).toHaveBeenCalledWith(1, "Send the deck to Alex"),
        );
    });

    it("does not open an item that is removed while its text is saved", async () => {
        let resolveUpdate: () => void = () => {};
        answer({
            tasks: [task(1, "Send the deck")],
            update: (id, title) =>
                new Promise<Task>((resolve) => {
                    resolveUpdate = () => resolve(task(id, title));
                }),
        });
        const onOpen = vi.fn();
        const user = userEvent.setup();
        renderPanel(onOpen);
        const field = await screen.findByRole("textbox", {
            name: "Action item",
        });

        await user.click(field);
        await user.keyboard("{End} to Alex");
        await user.click(
            screen.getByRole("button", {
                name: 'Open "Send the deck to Alex"',
            }),
        );
        await user.click(
            screen.getByRole("button", {
                name: 'Remove "Send the deck to Alex"',
            }),
        );
        await waitFor(() => expect(itemValues()).toEqual([]));
        await act(async () => resolveUpdate());

        expect(onOpen).not.toHaveBeenCalled();
    });

    it("drops a waiting text change when the item is removed, and Undo brings back the saved title", async () => {
        answer({ tasks: [task(1, "Send the deck"), task(2, "Book a room")] });
        const user = userEvent.setup();
        renderPanel();
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

        expect(
            await within(notifications()).findByText(
                'Deleted "Book a room for Friday".',
            ),
        ).toBeInTheDocument();
        await waitFor(() => expect(itemValues()).toEqual(["Send the deck"]));
        // Wait longer than the pause before an automatic save.
        await new Promise((resolve) => setTimeout(resolve, 800));
        expect(updateCalls()).toEqual([]);

        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        await waitFor(() =>
            expect(itemValues()).toEqual(["Send the deck", "Book a room"]),
        );
        expect(failureToasts()).toEqual([]);
    });

    it("shows the new title after the sheet saves", async () => {
        answer({ tasks: [task(1, "Send the deck"), task(2, "Call Sam")] });
        const { rerender } = renderPanel();
        await waitFor(() =>
            expect(itemValues()).toEqual(["Send the deck", "Call Sam"]),
        );

        rerender(task(1, "Send the deck today"));

        expect(itemValues()).toEqual(["Send the deck today", "Call Sam"]);
        expect(
            screen.getByRole("checkbox", {
                name: 'Complete "Send the deck today"',
            }),
        ).toBeInTheDocument();
        // The title is saved already, so the item does not save it again.
        await new Promise((resolve) => setTimeout(resolve, 800));
        expect(updateCalls()).toEqual([]);
    });

    it("saves the title that the sheet saved when it is typed again after a remove and Undo", async () => {
        answer({ tasks: [task(1, "Send the deck")] });
        const user = userEvent.setup();
        const { rerender } = renderPanel();
        await waitFor(() => expect(itemValues()).toEqual(["Send the deck"]));

        rerender(task(1, "Y"));
        const field = screen.getByRole("textbox", { name: "Action item" });
        await user.clear(field);
        await user.keyboard("Z");
        await waitFor(() =>
            expect(updateCalls()).toEqual([
                ["update_task_title", { id: 1, title: "Z" }],
            ]),
        );

        await user.click(screen.getByRole("button", { name: 'Remove "Z"' }));
        await waitFor(() => expect(itemValues()).toEqual([]));
        await user.click(
            await within(notifications()).findByRole("button", {
                name: "Undo",
            }),
        );
        await waitFor(() => expect(itemValues()).toEqual(["Z"]));

        await user.clear(screen.getByRole("textbox", { name: "Action item" }));
        await user.keyboard("Y");

        await waitFor(() =>
            expect(updateCalls()).toEqual([
                ["update_task_title", { id: 1, title: "Z" }],
                ["update_task_title", { id: 1, title: "Y" }],
            ]),
        );
    });

    it("comes back at its place after Undo", async () => {
        answer({
            tasks: [
                task(1, "Send the deck"),
                task(2, "Book a room"),
                task(3, "Call Sam"),
            ],
        });
        const user = userEvent.setup();
        renderPanel();
        await waitFor(() =>
            expect(itemValues()).toEqual([
                "Send the deck",
                "Book a room",
                "Call Sam",
            ]),
        );

        await user.click(
            screen.getByRole("button", { name: 'Remove "Book a room"' }),
        );
        await waitFor(() =>
            expect(itemValues()).toEqual(["Send the deck", "Call Sam"]),
        );
        await user.click(
            await within(notifications()).findByRole("button", {
                name: "Undo",
            }),
        );

        await waitFor(() =>
            expect(itemValues()).toEqual([
                "Send the deck",
                "Book a room",
                "Call Sam",
            ]),
        );
    });
});
