import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { DeleteContext, type DeleteApi } from "@/components/use-delete";
import type { Meeting } from "@/lib/meetings";
import type { Project } from "@/lib/projects";
import { MeetingProjectSelect } from "./meeting-project-select";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function project(
    id: number,
    name: string,
    fields: Partial<Project> = {},
): Project {
    return {
        id,
        name,
        description: "",
        createdAt: "2026-09-24T10:00:00.000Z",
        updatedAt: "2026-09-24T10:00:00.000Z",
        deletedAt: null,
        ...fields,
    };
}

function meeting(projectId: number | null): Meeting {
    return {
        id: 7,
        name: "Weekly sync",
        date: "2026-09-24",
        notes: "",
        initiativeIds: [],
        projectId,
        createdAt: "2026-09-24T10:00:00.000Z",
        updatedAt: "2026-09-24T10:00:00.000Z",
    };
}

const CHECKOUT = project(1, "checkout");
const BILLING = project(2, "Billing");
const OLD = project(3, "Old", { deletedAt: "2026-09-25T10:00:00.000Z" });

/**
 * Renders the select inside the providers of the toasts that report its failures. The
 * delete state has the given version, so a test can change it.
 */
function element(
    projectId: number | null,
    onSaved: (meeting: Meeting) => void = () => {},
    version = 0,
) {
    const deleteApi: DeleteApi = {
        deleteItem: () => Promise.resolve(),
        version,
        restored: null,
    };
    return (
        <Toaster toastManager={toast}>
            <FailureToastProvider>
                <DeleteContext.Provider value={deleteApi}>
                    <MeetingProjectSelect
                        meetingId={7}
                        projectId={projectId}
                        onSaved={onSaved}
                    />
                </DeleteContext.Provider>
            </FailureToastProvider>
        </Toaster>
    );
}

function select() {
    return screen.getByRole<HTMLSelectElement>("combobox", {
        name: "Meeting project",
    });
}

function optionTexts(): string[] {
    return Array.from(select().options).map((option) => option.text);
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

/** Makes the fake backend list the given projects and save each project change. */
function serve(projects: Project[]) {
    invoke.mockImplementation(
        (command: string, args: Record<string, unknown> = {}) => {
            switch (command) {
                case "list_projects":
                    return Promise.resolve(projects);
                case "set_meeting_project":
                    return Promise.resolve(
                        meeting(args.projectId as number | null),
                    );
                default:
                    return Promise.reject(`unexpected command ${command}`);
            }
        },
    );
}

beforeEach(() => {
    invoke.mockReset();
});

describe("MeetingProjectSelect", () => {
    it("shows the label, the empty choice, and the projects that are not deleted, by name", async () => {
        serve([CHECKOUT, BILLING, OLD]);
        render(element(null));
        await waitFor(() => expect(select()).toBeEnabled());

        expect(
            screen.getByText("Project", { selector: "label" }),
        ).toHaveAttribute("for", select().id);
        expect(invoke).toHaveBeenCalledWith("list_projects", {
            includeDeleted: true,
        });
        expect(optionTexts()).toEqual(["", "Billing", "checkout"]);
        expect(select()).toHaveValue("");
    });

    it("shows the deleted project of the meeting as the last choice until another one is saved", async () => {
        serve([CHECKOUT, BILLING, OLD]);
        const user = userEvent.setup();
        render(element(OLD.id));
        await waitFor(() => expect(select()).toBeEnabled());

        expect(optionTexts()).toEqual(["", "Billing", "checkout", "Old"]);
        expect(select()).toHaveValue(String(OLD.id));

        await user.selectOptions(select(), "Billing");

        await waitFor(() =>
            expect(optionTexts()).toEqual(["", "Billing", "checkout"]),
        );
    });

    it("saves a change at once and gives the stored meeting to onSaved", async () => {
        serve([CHECKOUT, BILLING]);
        const onSaved = vi.fn();
        const user = userEvent.setup();
        render(element(null, onSaved));
        await waitFor(() => expect(select()).toBeEnabled());

        await user.selectOptions(select(), "Billing");

        expect(invoke).toHaveBeenCalledWith("set_meeting_project", {
            id: 7,
            projectId: BILLING.id,
        });
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(onSaved).toHaveBeenCalledWith(meeting(BILLING.id));
        expect(select()).toHaveValue(String(BILLING.id));
    });

    it("goes back to the saved choice and shows a failure toast when the change cannot be saved", async () => {
        invoke.mockImplementation((command: string) => {
            switch (command) {
                case "list_projects":
                    return Promise.resolve([CHECKOUT, BILLING]);
                case "set_meeting_project":
                    return Promise.reject("database is locked");
                default:
                    return Promise.reject(`unexpected command ${command}`);
            }
        });
        const onSaved = vi.fn();
        const user = userEvent.setup();
        render(element(CHECKOUT.id, onSaved));
        await waitFor(() => expect(select()).toBeEnabled());

        await user.selectOptions(select(), "Billing");

        expect(
            await within(notifications()).findByText(
                "Couldn't change the project. Try again.",
            ),
        ).toBeInTheDocument();
        expect(select()).toHaveValue(String(CHECKOUT.id));
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("keeps the latest choice when an earlier save fails after it", async () => {
        let rejectFirst: (reason: unknown) => void = () => {};
        let saveCalls = 0;
        invoke.mockImplementation(
            (command: string, args: Record<string, unknown> = {}) => {
                switch (command) {
                    case "list_projects":
                        return Promise.resolve([CHECKOUT, BILLING]);
                    case "set_meeting_project":
                        saveCalls += 1;
                        if (saveCalls === 1) {
                            return new Promise((_, reject) => {
                                rejectFirst = reject;
                            });
                        }
                        return Promise.resolve(
                            meeting(args.projectId as number | null),
                        );
                    default:
                        return Promise.reject(`unexpected command ${command}`);
                }
            },
        );
        const user = userEvent.setup();
        render(element(null));
        await waitFor(() => expect(select()).toBeEnabled());

        await user.selectOptions(select(), "checkout");
        await user.selectOptions(select(), "Billing");
        await waitFor(() => expect(saveCalls).toBe(2));
        await act(async () => rejectFirst("database is locked"));

        expect(select()).toHaveValue(String(BILLING.id));
        expect(
            within(notifications()).queryByText(
                "Couldn't change the project. Try again.",
            ),
        ).not.toBeInTheDocument();
    });

    it("loads the choices again after a delete or a restore", async () => {
        serve([CHECKOUT]);
        const { rerender } = render(element(null));
        await waitFor(() => expect(select()).toBeEnabled());
        expect(optionTexts()).toEqual(["", "checkout"]);

        serve([CHECKOUT, BILLING]);
        rerender(element(null, () => {}, 1));

        await waitFor(() =>
            expect(optionTexts()).toEqual(["", "Billing", "checkout"]),
        );
    });
});
