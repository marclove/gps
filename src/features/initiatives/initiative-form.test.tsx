import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { AUTOSAVE_DELAY_MS } from "@/hooks/use-autosave";
import type { CreateResult, Initiative, RenameResult } from "@/lib/initiatives";
import { InitiativeForm } from "./initiative-form";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const PILOT: Initiative = {
    id: 7,
    name: "Pilot",
    description: "",
    raciRole: null,
    horizon: "next",
    position: 0,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    completedAt: null,
    archivedAt: null,
};

/** Returns a promise and the function that resolves it. */
function deferred<T>() {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    invoke.mockReset();
    consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
});

function renderForm(initiative: Initiative | null = PILOT) {
    const onSaved = vi.fn();
    const onCreated = vi.fn();
    const onDelete = vi.fn((savedName: string) => {
        void savedName;
        return Promise.resolve();
    });
    const onSave = vi.fn();
    const view = render(
        <Toaster toastManager={toast}>
            <FailureToastProvider>
                <InitiativeForm
                    initiative={initiative}
                    onSaved={onSaved}
                    onCreated={onCreated}
                    onDelete={onDelete}
                    onSave={onSave}
                />
            </FailureToastProvider>
        </Toaster>,
    );
    const name = screen.getByRole("textbox", { name: "Initiative name" });
    return { ...view, onSaved, onCreated, onDelete, onSave, name };
}

/** Waits until the autosave pause has passed. */
async function waitForAutosavePause() {
    await act(
        () =>
            new Promise((resolve) =>
                setTimeout(resolve, AUTOSAVE_DELAY_MS + 100),
            ),
    );
}

/** Returns the calls of a backend command. */
function callsOf(command: string) {
    return invoke.mock.calls.filter(([called]) => called === command);
}

describe("InitiativeForm", () => {
    it("marks the name as taken and still saves a changed role", async () => {
        invoke.mockImplementation((command: string, args) => {
            if (command === "rename_initiative")
                return Promise.resolve({ status: "nameTaken" });
            if (command === "update_initiative")
                return Promise.resolve({ ...PILOT, raciRole: args.raciRole });
            return Promise.reject(new Error(`Unexpected ${command}`));
        });
        const user = userEvent.setup();
        const { onSaved, name } = renderForm();

        await user.clear(name);
        await user.type(name, " Launch ");
        await user.selectOptions(
            screen.getByRole("combobox", { name: "RACI role" }),
            "Informed",
        );

        expect(
            await screen.findByText('Another initiative is named "Launch".'),
        ).toBeInTheDocument();
        expect(name).toHaveAttribute("aria-invalid", "true");
        expect(name).toHaveAccessibleDescription(
            'Another initiative is named "Launch".',
        );
        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith("update_initiative", {
                id: 7,
                description: "",
                raciRole: "informed",
            }),
        );
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(onSaved).toHaveBeenLastCalledWith(
            expect.objectContaining({ name: "Pilot", raciRole: "informed" }),
        );
        expect(screen.queryByText("Couldn't save")).not.toBeInTheDocument();
    });

    it("clears the message after a later rename succeeds", async () => {
        invoke.mockImplementation((command: string, args) => {
            if (command !== "rename_initiative")
                return Promise.reject(new Error(`Unexpected ${command}`));
            return Promise.resolve(
                args.name === "Launch"
                    ? { status: "nameTaken" }
                    : {
                          status: "renamed",
                          initiative: { ...PILOT, name: args.name },
                      },
            );
        });
        const user = userEvent.setup();
        const { onSaved, name } = renderForm();
        await user.clear(name);
        await user.type(name, "Launch");
        await screen.findByText('Another initiative is named "Launch".');

        await user.type(name, " v2");

        await waitFor(() =>
            expect(
                screen.queryByText(/^Another initiative is named/),
            ).not.toBeInTheDocument(),
        );
        expect(name).not.toHaveAttribute("aria-invalid", "true");
        expect(onSaved).toHaveBeenCalledTimes(1);
        const summary = onSaved.mock.calls[0][0];
        expect(summary).toMatchObject({ id: 7, name: "Launch v2" });
        expect(summary).not.toHaveProperty("description");
    });

    describe("when it unmounts while a rename is waiting", () => {
        async function unmountWhileRenaming() {
            const rename = deferred<RenameResult>();
            invoke.mockImplementation((command: string) =>
                command === "rename_initiative"
                    ? rename.promise
                    : Promise.reject(new Error(`Unexpected ${command}`)),
            );
            const user = userEvent.setup();
            const { onSaved, name, unmount } = renderForm();
            await user.clear(name);
            await user.type(name, "Launch");

            unmount();

            expect(invoke).toHaveBeenCalledWith("rename_initiative", {
                id: 7,
                name: "Launch",
            });
            return { onSaved, rename };
        }

        it("does not report a name that is taken", async () => {
            const { onSaved, rename } = await unmountWhileRenaming();

            await act(async () => rename.resolve({ status: "nameTaken" }));

            expect(onSaved).not.toHaveBeenCalled();
        });

        it("reports the saved initiative after a rename succeeds", async () => {
            const { onSaved, rename } = await unmountWhileRenaming();

            await act(async () =>
                rename.resolve({
                    status: "renamed",
                    initiative: { ...PILOT, name: "Launch" },
                }),
            );

            expect(onSaved).toHaveBeenCalledTimes(1);
            expect(onSaved.mock.calls[0][0]).toMatchObject({
                id: 7,
                name: "Launch",
            });
        });
    });

    it("calls onSave when Save is clicked, and saves nothing itself", async () => {
        const user = userEvent.setup();
        const { onSave } = renderForm();

        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(invoke).not.toHaveBeenCalled();
    });

    describe("Delete", () => {
        it("saves a waiting rename first and gives the name that the backend stored", async () => {
            const rename = deferred<RenameResult>();
            invoke.mockImplementation((command: string) => {
                if (command === "rename_initiative") return rename.promise;
                return Promise.reject(new Error(`Unexpected ${command}`));
            });
            const user = userEvent.setup();
            const { onDelete, name } = renderForm();

            await user.type(name, " v2 ");
            await user.click(screen.getByRole("button", { name: "Delete" }));
            expect(invoke).toHaveBeenCalledWith("rename_initiative", {
                id: 7,
                name: "Pilot v2 ",
            });
            expect(onDelete).not.toHaveBeenCalled();

            await act(async () =>
                rename.resolve({
                    status: "renamed",
                    initiative: { ...PILOT, name: "Pilot v2" },
                }),
            );

            expect(onDelete).toHaveBeenCalledExactlyOnceWith("Pilot v2");
        });

        it("gives the old name when another initiative has the new name", async () => {
            invoke.mockImplementation((command: string) => {
                if (command === "rename_initiative")
                    return Promise.resolve({ status: "nameTaken" });
                return Promise.reject(new Error(`Unexpected ${command}`));
            });
            const user = userEvent.setup();
            const { onDelete, name } = renderForm();

            await user.clear(name);
            await user.type(name, "Launch");
            await user.click(screen.getByRole("button", { name: "Delete" }));

            await waitFor(() =>
                expect(onDelete).toHaveBeenCalledExactlyOnceWith("Pilot"),
            );
        });

        it("does not delete and shows a failure toast when a waiting change cannot be saved", async () => {
            invoke.mockImplementation((command: string) => {
                if (command === "rename_initiative")
                    return Promise.reject(new Error("disk full"));
                return Promise.reject(new Error(`Unexpected ${command}`));
            });
            const user = userEvent.setup();
            const { onDelete, name } = renderForm();

            await user.type(name, " v2");
            await user.click(screen.getByRole("button", { name: "Delete" }));

            expect(
                await within(
                    screen.getByRole("region", { name: "Notifications" }),
                ).findByText("Couldn't delete the initiative. Try again."),
            ).toBeInTheDocument();
            expect(onDelete).not.toHaveBeenCalled();
            expect(
                screen.getByRole("button", { name: "Delete" }),
            ).toBeEnabled();
        });

        it("is disabled until the delete finishes", async () => {
            const done = deferred<void>();
            const user = userEvent.setup();
            const { onDelete } = renderForm();
            onDelete.mockReturnValue(done.promise);
            const button = screen.getByRole("button", { name: "Delete" });

            await user.click(button);
            expect(onDelete).toHaveBeenCalledExactlyOnceWith("Pilot");
            expect(button).toBeDisabled();

            await act(async () => done.resolve());
            expect(button).toBeEnabled();
        });
    });

    describe("for a draft", () => {
        it("creates nothing when the name is typed and cleared before the pause", async () => {
            const user = userEvent.setup();
            const { onSaved, name, unmount } = renderForm(null);

            await user.type(name, "Launch");
            await user.clear(name);
            await waitForAutosavePause();
            unmount();

            expect(invoke).not.toHaveBeenCalled();
            expect(onSaved).not.toHaveBeenCalled();
        });

        it("shows no Delete button and no save status until it is created", async () => {
            invoke.mockImplementation((command: string, args) =>
                command === "create_initiative"
                    ? Promise.resolve({
                          status: "created",
                          initiative: { ...PILOT, name: args.name.trim() },
                      })
                    : Promise.reject(new Error(`Unexpected ${command}`)),
            );
            const user = userEvent.setup();
            const { name } = renderForm(null);

            expect(
                screen.queryByRole("button", { name: "Delete" }),
            ).not.toBeInTheDocument();
            expect(screen.queryByRole("status")).not.toBeInTheDocument();

            await user.type(name, "Launch");

            expect(
                await screen.findByRole("button", { name: "Delete" }),
            ).toBeInTheDocument();
            await waitFor(() =>
                expect(screen.getByRole("status")).toHaveTextContent("Saved"),
            );
        });

        it("renames and updates the created initiative after the first save, and never creates it again", async () => {
            invoke.mockImplementation((command: string, args) => {
                if (command === "create_initiative")
                    return Promise.resolve({
                        status: "created",
                        initiative: { ...PILOT, name: args.name.trim() },
                    });
                if (command === "rename_initiative")
                    return Promise.resolve({
                        status: "renamed",
                        initiative: { ...PILOT, name: args.name.trim() },
                    });
                if (command === "update_initiative")
                    return Promise.resolve({
                        ...PILOT,
                        raciRole: args.raciRole,
                    });
                return Promise.reject(new Error(`Unexpected ${command}`));
            });
            const user = userEvent.setup();
            const { onSaved, onCreated, name } = renderForm(null);

            await user.type(name, "Launch");
            await waitFor(() => expect(onCreated).toHaveBeenCalledWith(7));
            expect(callsOf("create_initiative")).toEqual([
                [
                    "create_initiative",
                    { name: "Launch", description: "", raciRole: null },
                ],
            ]);
            expect(onSaved).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 7, name: "Launch" }),
            );

            await user.type(name, " v2");
            await waitFor(() =>
                expect(invoke).toHaveBeenCalledWith("rename_initiative", {
                    id: 7,
                    name: "Launch v2",
                }),
            );
            await user.selectOptions(
                screen.getByRole("combobox", { name: "RACI role" }),
                "Informed",
            );
            await waitFor(() =>
                expect(invoke).toHaveBeenCalledWith("update_initiative", {
                    id: 7,
                    description: "",
                    raciRole: "informed",
                }),
            );

            expect(callsOf("create_initiative")).toHaveLength(1);
            expect(onCreated).toHaveBeenCalledTimes(1);
        });

        it("reports the created initiative when it unmounts while a change is waiting", async () => {
            const create = deferred<CreateResult>();
            invoke.mockImplementation((command: string) =>
                command === "create_initiative"
                    ? create.promise
                    : Promise.reject(new Error(`Unexpected ${command}`)),
            );
            const user = userEvent.setup();
            const { onSaved, onCreated, name, unmount } = renderForm(null);
            await user.type(name, "Launch");

            unmount();

            expect(invoke).toHaveBeenCalledExactlyOnceWith(
                "create_initiative",
                { name: "Launch", description: "", raciRole: null },
            );
            await act(async () =>
                create.resolve({
                    status: "created",
                    initiative: { ...PILOT, name: "Launch" },
                }),
            );
            expect(onSaved).toHaveBeenCalledTimes(1);
            expect(onSaved.mock.calls[0][0]).toMatchObject({
                id: 7,
                name: "Launch",
            });
            expect(onSaved.mock.calls[0][0]).not.toHaveProperty("description");
            expect(onCreated).not.toHaveBeenCalled();
        });

        it("saves the role with an empty name when the name is taken", async () => {
            invoke.mockImplementation((command: string, args) => {
                if (command !== "create_initiative")
                    return Promise.reject(new Error(`Unexpected ${command}`));
                return Promise.resolve(
                    args.name === ""
                        ? {
                              status: "created",
                              initiative: {
                                  ...PILOT,
                                  name: "",
                                  raciRole: args.raciRole,
                              },
                          }
                        : { status: "nameTaken" },
                );
            });
            const user = userEvent.setup();
            const { onSaved, name } = renderForm(null);

            await user.type(name, "Launch");
            await user.selectOptions(
                screen.getByRole("combobox", { name: "RACI role" }),
                "Informed",
            );

            await waitFor(() => expect(onSaved).toHaveBeenCalled());
            expect(callsOf("create_initiative")).toEqual([
                [
                    "create_initiative",
                    { name: "Launch", description: "", raciRole: "informed" },
                ],
                [
                    "create_initiative",
                    { name: "", description: "", raciRole: "informed" },
                ],
            ]);
            expect(
                screen.getByText('Another initiative is named "Launch".'),
            ).toBeInTheDocument();
        });
    });
});
