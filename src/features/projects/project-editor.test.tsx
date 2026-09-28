import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { DeleteProvider } from "@/components/delete-provider";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { AUTOSAVE_DELAY_MS } from "@/hooks/use-autosave";
import type { Project } from "@/lib/projects";
import { ProjectEditor } from "./project-editor";
import { ProjectPage } from "./project-page";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function project(fields: Partial<Project> & { id: number }): Project {
    return {
        name: "",
        description: "",
        createdAt: "2026-09-01T10:00:00Z",
        updatedAt: "2026-09-01T10:00:00Z",
        deletedAt: null,
        ...fields,
    };
}

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

/** Waits until the autosave pause has passed. */
async function waitForAutosavePause() {
    await act(
        () =>
            new Promise((resolve) =>
                setTimeout(resolve, AUTOSAVE_DELAY_MS + 100),
            ),
    );
}

/** Shows the path of the current route, so a test can read it. */
function CurrentPath() {
    return <span data-testid="path">{useLocation().pathname}</span>;
}

/** Renders the project page at `path`, with the providers that it needs. */
function renderProjectPage(path: string) {
    render(
        <Toaster toastManager={toast}>
            <FailureToastProvider>
                <DeleteProvider>
                    <MemoryRouter initialEntries={[path]}>
                        <Routes>
                            <Route
                                path="/projects"
                                element={<p>Projects list</p>}
                            />
                            <Route
                                path="/projects/:id"
                                element={<ProjectPage />}
                            />
                        </Routes>
                        <CurrentPath />
                    </MemoryRouter>
                </DeleteProvider>
            </FailureToastProvider>
        </Toaster>,
    );
}

function commands(): string[] {
    return invoke.mock.calls.map(([command]) => command as string);
}

describe("ProjectEditor", () => {
    it("creates a draft whose name is taken with an empty name when it has a description", async () => {
        invoke.mockImplementation(
            (command: string, args: { name: string; description: string }) => {
                if (command !== "create_project") {
                    return Promise.reject(new Error(`unexpected ${command}`));
                }
                return Promise.resolve(
                    args.name === "Checkout"
                        ? { status: "nameTaken" }
                        : {
                              status: "created",
                              project: project({ id: 4, ...args }),
                          },
                );
            },
        );
        const onCreated = vi.fn();
        const user = userEvent.setup();
        render(
            <Toaster toastManager={toast}>
                <FailureToastProvider>
                    <DeleteProvider>
                        <MemoryRouter>
                            <ProjectEditor
                                project={null}
                                onCreated={onCreated}
                            />
                        </MemoryRouter>
                    </DeleteProvider>
                </FailureToastProvider>
            </Toaster>,
        );
        const name = screen.getByRole("textbox", { name: "Project name" });

        await user.type(name, "Checkout");
        await user.click(screen.getByRole("textbox", { name: "Description" }));
        await user.keyboard("Notes");

        await waitFor(() => expect(onCreated).toHaveBeenCalledWith(4), {
            timeout: 2000,
        });
        const creates = invoke.mock.calls.filter(
            ([command]) => command === "create_project",
        );
        expect(creates).toHaveLength(2);
        expect(creates[0][1]).toMatchObject({ name: "Checkout" });
        expect(creates[1][1]).toMatchObject({ name: "" });
        expect(creates[1][1].description).toContain("Notes");
        expect(
            screen.getByText('Another project is named "Checkout".'),
        ).toBeInTheDocument();
        expect(name).toHaveAttribute("aria-invalid", "true");
        expect(
            within(
                screen.getByRole("navigation", { name: "breadcrumb" }),
            ).getByText("Untitled project"),
        ).toBeInTheDocument();
    });
});

describe("ProjectPage", () => {
    it("keeps the typed text and the focus while the draft is created and the route changes", async () => {
        const create = deferred<unknown>();
        invoke.mockImplementation(
            (command: string, args: { id: number; name: string }) => {
                switch (command) {
                    case "create_project":
                        return create.promise;
                    case "rename_project":
                        return Promise.resolve({
                            status: "renamed",
                            project: project({ id: 4, name: args.name }),
                        });
                    default:
                        return Promise.reject(
                            new Error(`unexpected ${command}`),
                        );
                }
            },
        );
        const user = userEvent.setup();
        renderProjectPage("/projects/new");
        const name = screen.getByRole("textbox", { name: "Project name" });
        await waitFor(() => expect(name).toHaveFocus());

        await user.type(name, "Checkout");
        await waitFor(() => expect(commands()).toEqual(["create_project"]), {
            timeout: 2000,
        });
        await user.type(name, " v2");
        await act(async () => {
            create.resolve({
                status: "created",
                project: project({ id: 4, name: "Checkout" }),
            });
            await create.promise;
        });
        await waitFor(() =>
            expect(screen.getByTestId("path")).toHaveTextContent("/projects/4"),
        );

        const field = screen.getByRole("textbox", { name: "Project name" });
        expect(field).toBe(name);
        expect(field).toHaveValue("Checkout v2");
        expect(field).toHaveFocus();
        await waitFor(
            () =>
                expect(invoke).toHaveBeenCalledWith("rename_project", {
                    id: 4,
                    name: "Checkout v2",
                }),
            { timeout: 2000 },
        );
        expect(commands()).not.toContain("get_project");
    });

    it("saves a change that is waiting before it deletes the project", async () => {
        let stored = project({ id: 7, name: "Checkout" });
        invoke.mockImplementation(
            (command: string, args: { id: number; name: string }) => {
                switch (command) {
                    case "get_project":
                        return Promise.resolve(stored);
                    case "rename_project":
                        stored = { ...stored, name: args.name };
                        return Promise.resolve({
                            status: "renamed",
                            project: stored,
                        });
                    case "delete_project":
                        return Promise.resolve({ status: "deleted" });
                    default:
                        return Promise.reject(
                            new Error(`unexpected ${command}`),
                        );
                }
            },
        );
        const user = userEvent.setup();
        renderProjectPage("/projects/7");
        const name = await screen.findByRole("textbox", {
            name: "Project name",
        });

        await user.type(name, " v2");
        await user.click(screen.getByRole("button", { name: "Delete" }));

        expect(
            await screen.findByText('Deleted "Checkout v2".'),
        ).toBeInTheDocument();
        // Nothing is saved again after the delete.
        await waitForAutosavePause();
        expect(commands()).toEqual([
            "get_project",
            "rename_project",
            "delete_project",
        ]);
        expect(screen.getByTestId("path").textContent).toBe("/projects");
    });
});
