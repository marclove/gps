import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { AUTOSAVE_DELAY_MS } from "@/hooks/use-autosave";
import type {
    CreateResult,
    Initiative,
    MoveToProjectResult,
    RenameResult,
} from "@/lib/initiatives";
import type { Project } from "@/lib/projects";
import { InitiativeForm } from "./initiative-form";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function project(id: number, name: string): Project {
    return {
        id,
        name,
        description: "",
        createdAt: "2026-09-01T10:00:00Z",
        updatedAt: "2026-09-01T10:00:00Z",
        deletedAt: null,
    };
}

const BILLING = project(1, "Billing");
const CHECKOUT = project(2, "Checkout");
const PAYMENTS = project(3, "Payments");

const PILOT: Initiative = {
    id: 7,
    projectId: CHECKOUT.id,
    name: "Pilot",
    description: "",
    raciRole: null,
    horizon: "next",
    rank: "8",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    completedAt: null,
    deletedAt: null,
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

/** The projects that `list_projects` returns. */
let projects: Project[];

/**
 * Answers `list_projects` with `projects`, and every other command with `answer`. The
 * default answer rejects every other command.
 */
function mockBackend(
    answer: (
        command: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: any,
    ) => Promise<unknown> = (command) =>
        Promise.reject(new Error(`Unexpected ${command}`)),
) {
    invoke.mockImplementation((command: string, args) =>
        command === "list_projects"
            ? Promise.resolve(projects)
            : answer(command, args),
    );
}

beforeEach(() => {
    invoke.mockReset();
    projects = [CHECKOUT];
    mockBackend();
    consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
});

/**
 * Renders the form and waits until it has loaded the projects. For a draft, `draftProjectId`
 * is the project that the draft starts in.
 */
async function renderForm(
    initiative: Initiative | null = PILOT,
    draftProjectId: number | null = null,
) {
    const onSaved = vi.fn();
    const onCreated = vi.fn();
    const onDelete = vi.fn((savedName: string) => {
        void savedName;
        return Promise.resolve();
    });
    const onSave = vi.fn();
    const view = render(
        <MemoryRouter>
            <Toaster toastManager={toast}>
                <FailureToastProvider>
                    <InitiativeForm
                        initiative={initiative}
                        draftProjectId={draftProjectId}
                        onSaved={onSaved}
                        onCreated={onCreated}
                        onDelete={onDelete}
                        onSave={onSave}
                    />
                </FailureToastProvider>
            </Toaster>
        </MemoryRouter>,
    );
    // Lets the projects load.
    await act(async () => {});
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

/** Returns the calls of the backend that save something: all calls except `list_projects`. */
function saveCalls() {
    return invoke.mock.calls.filter(([called]) => called !== "list_projects");
}

function projectSelect() {
    return screen.getByRole<HTMLSelectElement>("combobox", { name: "Project" });
}

function optionTexts(select: HTMLSelectElement): string[] {
    return Array.from(select.options).map((option) => option.text);
}

describe("InitiativeForm", () => {
    it("marks the name as taken and still saves a changed role", async () => {
        mockBackend((command: string, args) => {
            if (command === "rename_initiative")
                return Promise.resolve({ status: "nameTaken" });
            if (command === "update_initiative")
                return Promise.resolve({ ...PILOT, raciRole: args.raciRole });
            return Promise.reject(new Error(`Unexpected ${command}`));
        });
        const user = userEvent.setup();
        const { onSaved, name } = await renderForm();

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
        mockBackend((command: string, args) => {
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
        const { onSaved, name } = await renderForm();
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
            mockBackend((command: string) =>
                command === "rename_initiative"
                    ? rename.promise
                    : Promise.reject(new Error(`Unexpected ${command}`)),
            );
            const user = userEvent.setup();
            const { onSaved, name, unmount } = await renderForm();
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
        const { onSave } = await renderForm();

        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(saveCalls()).toEqual([]);
    });

    describe("Delete", () => {
        it("saves a waiting rename first and gives the name that the backend stored", async () => {
            const rename = deferred<RenameResult>();
            mockBackend((command: string) => {
                if (command === "rename_initiative") return rename.promise;
                return Promise.reject(new Error(`Unexpected ${command}`));
            });
            const user = userEvent.setup();
            const { onDelete, name } = await renderForm();

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
            mockBackend((command: string) => {
                if (command === "rename_initiative")
                    return Promise.resolve({ status: "nameTaken" });
                return Promise.reject(new Error(`Unexpected ${command}`));
            });
            const user = userEvent.setup();
            const { onDelete, name } = await renderForm();

            await user.clear(name);
            await user.type(name, "Launch");
            await user.click(screen.getByRole("button", { name: "Delete" }));

            await waitFor(() =>
                expect(onDelete).toHaveBeenCalledExactlyOnceWith("Pilot"),
            );
        });

        it("does not delete and shows a failure toast when a waiting change cannot be saved", async () => {
            mockBackend((command: string) => {
                if (command === "rename_initiative")
                    return Promise.reject(new Error("disk full"));
                return Promise.reject(new Error(`Unexpected ${command}`));
            });
            const user = userEvent.setup();
            const { onDelete, name } = await renderForm();

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
            const { onDelete } = await renderForm();
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
            const { onSaved, name, unmount } = await renderForm(null);

            await user.type(name, "Launch");
            await user.clear(name);
            await waitForAutosavePause();
            unmount();

            expect(saveCalls()).toEqual([]);
            expect(onSaved).not.toHaveBeenCalled();
        });

        it("shows no Delete button and no save status until it is created", async () => {
            mockBackend((command: string, args) =>
                command === "create_initiative"
                    ? Promise.resolve({
                          status: "created",
                          initiative: { ...PILOT, name: args.name.trim() },
                      })
                    : Promise.reject(new Error(`Unexpected ${command}`)),
            );
            const user = userEvent.setup();
            const { name } = await renderForm(null);

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
            mockBackend((command: string, args) => {
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
            const { onSaved, onCreated, name } = await renderForm(null);

            await user.type(name, "Launch");
            await waitFor(() => expect(onCreated).toHaveBeenCalledWith(7));
            expect(callsOf("create_initiative")).toEqual([
                [
                    "create_initiative",
                    {
                        projectId: CHECKOUT.id,
                        name: "Launch",
                        description: "",
                        raciRole: null,
                    },
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
            mockBackend((command: string) =>
                command === "create_initiative"
                    ? create.promise
                    : Promise.reject(new Error(`Unexpected ${command}`)),
            );
            const user = userEvent.setup();
            const { onSaved, onCreated, name, unmount } =
                await renderForm(null);
            await user.type(name, "Launch");

            unmount();

            expect(saveCalls()).toEqual([
                [
                    "create_initiative",
                    {
                        projectId: CHECKOUT.id,
                        name: "Launch",
                        description: "",
                        raciRole: null,
                    },
                ],
            ]);
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
            mockBackend((command: string, args) => {
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
            const { onSaved, name } = await renderForm(null);

            await user.type(name, "Launch");
            await user.selectOptions(
                screen.getByRole("combobox", { name: "RACI role" }),
                "Informed",
            );

            await waitFor(() => expect(onSaved).toHaveBeenCalled());
            expect(callsOf("create_initiative")).toEqual([
                [
                    "create_initiative",
                    {
                        projectId: CHECKOUT.id,
                        name: "Launch",
                        description: "",
                        raciRole: "informed",
                    },
                ],
                [
                    "create_initiative",
                    {
                        projectId: CHECKOUT.id,
                        name: "",
                        description: "",
                        raciRole: "informed",
                    },
                ],
            ]);
            expect(
                screen.getByText('Another initiative is named "Launch".'),
            ).toBeInTheDocument();
        });
    });
    describe("Project", () => {
        it("comes after the RACI role, with the label Project", async () => {
            await renderForm();

            expect(screen.getByLabelText("Project")).toBe(projectSelect());
            expect(
                screen
                    .getByRole("combobox", { name: "RACI role" })
                    .compareDocumentPosition(projectSelect()) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });

        it("offers the projects that are not deleted by name, with no empty choice, for a saved initiative", async () => {
            projects = [CHECKOUT, BILLING];
            await renderForm();

            expect(invoke).toHaveBeenCalledWith("list_projects", {
                includeDeleted: false,
            });
            expect(optionTexts(projectSelect())).toEqual([
                "Billing",
                "Checkout",
            ]);
            expect(projectSelect()).toHaveValue(String(CHECKOUT.id));
            expect(projectSelect()).toBeEnabled();
        });

        it("moves a saved initiative at once and reports the moved summary", async () => {
            projects = [CHECKOUT, BILLING];
            mockBackend((command, args) =>
                command === "set_initiative_project"
                    ? Promise.resolve({
                          status: "moved",
                          initiative: { ...PILOT, projectId: args.projectId },
                      })
                    : Promise.reject(new Error(`Unexpected ${command}`)),
            );
            const user = userEvent.setup();
            const { onSaved } = await renderForm();

            await user.selectOptions(projectSelect(), "Billing");

            expect(saveCalls()).toEqual([
                ["set_initiative_project", { id: 7, projectId: BILLING.id }],
            ]);
            await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
            const summary = onSaved.mock.calls[0][0];
            expect(summary).toMatchObject({ id: 7, projectId: BILLING.id });
            expect(summary).not.toHaveProperty("description");
            expect(projectSelect()).toHaveValue(String(BILLING.id));
        });

        it("goes back and says so when the other project has the name", async () => {
            projects = [CHECKOUT, BILLING];
            mockBackend((command) =>
                command === "set_initiative_project"
                    ? Promise.resolve({ status: "nameTaken" })
                    : Promise.reject(new Error(`Unexpected ${command}`)),
            );
            const user = userEvent.setup();
            const { onSaved } = await renderForm({ ...PILOT, name: "Launch" });

            await user.selectOptions(projectSelect(), "Billing");

            const message =
                'Another initiative in "Billing" is named "Launch".';
            expect(await screen.findByText(message)).toBeInTheDocument();
            expect(projectSelect()).toHaveValue(String(CHECKOUT.id));
            expect(projectSelect()).toHaveAccessibleDescription(message);
            expect(onSaved).not.toHaveBeenCalled();
        });

        it("goes back and shows a failure toast when the move fails", async () => {
            projects = [CHECKOUT, BILLING];
            mockBackend((command) =>
                Promise.reject(new Error(`Failed ${command}`)),
            );
            const user = userEvent.setup();
            await renderForm();

            await user.selectOptions(projectSelect(), "Billing");

            expect(
                await within(
                    screen.getByRole("region", { name: "Notifications" }),
                ).findByText(
                    "Couldn't move the initiative to the project. Try again.",
                ),
            ).toBeInTheDocument();
            expect(projectSelect()).toHaveValue(String(CHECKOUT.id));
        });

        it("keeps the newer choice when an older move finishes after it", async () => {
            projects = [CHECKOUT, BILLING, PAYMENTS];
            const moves = new Map<
                number,
                ReturnType<typeof deferred<MoveToProjectResult>>
            >();
            mockBackend((command, args) => {
                if (command !== "set_initiative_project")
                    return Promise.reject(new Error(`Unexpected ${command}`));
                const move = deferred<MoveToProjectResult>();
                moves.set(args.projectId, move);
                return move.promise;
            });
            const user = userEvent.setup();
            await renderForm();

            await user.selectOptions(projectSelect(), "Billing");
            await user.selectOptions(projectSelect(), "Payments");
            await act(async () =>
                moves.get(PAYMENTS.id)!.resolve({
                    status: "moved",
                    initiative: { ...PILOT, projectId: PAYMENTS.id },
                }),
            );
            await act(async () =>
                moves.get(BILLING.id)!.resolve({
                    status: "moved",
                    initiative: { ...PILOT, projectId: BILLING.id },
                }),
            );

            expect(projectSelect()).toHaveValue(String(PAYMENTS.id));
        });
    });

    describe("Project of a draft", () => {
        it("starts on the project that opened the draft", async () => {
            projects = [CHECKOUT, BILLING];
            await renderForm(null, BILLING.id);

            expect(optionTexts(projectSelect())).toEqual([
                "",
                "Billing",
                "Checkout",
            ]);
            expect(projectSelect()).toHaveValue(String(BILLING.id));
        });

        it("starts on the only project when exactly one exists", async () => {
            projects = [CHECKOUT];
            await renderForm(null);

            expect(projectSelect()).toHaveValue(String(CHECKOUT.id));
        });

        it("starts on the empty choice when there are several projects", async () => {
            projects = [CHECKOUT, BILLING];
            await renderForm(null);

            expect(projectSelect()).toHaveValue("");
        });

        it("is created only when it has a project and is not empty", async () => {
            projects = [CHECKOUT, BILLING];
            mockBackend((command, args) =>
                command === "create_initiative"
                    ? Promise.resolve({
                          status: "created",
                          initiative: {
                              ...PILOT,
                              projectId: args.projectId,
                              name: args.name,
                          },
                      })
                    : Promise.reject(new Error(`Unexpected ${command}`)),
            );
            const user = userEvent.setup();
            const { name, onCreated } = await renderForm(null);

            await user.selectOptions(projectSelect(), "Billing");
            await waitForAutosavePause();
            await user.selectOptions(projectSelect(), "");
            await user.type(name, "Launch");
            await waitForAutosavePause();
            expect(saveCalls()).toEqual([]);

            await user.selectOptions(projectSelect(), "Checkout");

            await waitFor(() => expect(onCreated).toHaveBeenCalledWith(7));
            expect(saveCalls()).toEqual([
                [
                    "create_initiative",
                    {
                        projectId: CHECKOUT.id,
                        name: "Launch",
                        description: "",
                        raciRole: null,
                    },
                ],
            ]);
        });

        it("says to create a project first when no project exists", async () => {
            projects = [];
            await renderForm(null);

            expect(projectSelect()).toBeDisabled();
            expect(
                screen.getByText(/Create a project first\./),
            ).toBeInTheDocument();
            expect(
                screen.getByRole("link", { name: "Projects" }),
            ).toHaveAttribute("href", "/projects");
        });
    });
});
