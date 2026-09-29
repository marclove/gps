import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { DeleteProvider } from "@/components/delete-provider";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import type { InitiativeSheet } from "@/features/initiatives/initiative-sheet";
import type { InitiativeSummary } from "@/lib/initiatives";
import {
    FakeBackend,
    type StoredInitiative,
    type StoredProject,
} from "@/test/fake-backend";
import { ProjectInitiatives } from "./project-initiatives";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

type SheetProps = ComponentProps<typeof InitiativeSheet>;

// The real sheet has its own tests. A stub keeps the props of the last render, so that a test
// can act as the sheet, and shows what the sheet shows.
const sheet = vi.hoisted(() => ({ props: null as SheetProps | null }));

vi.mock("@/features/initiatives/initiative-sheet", () => ({
    InitiativeSheet: (props: SheetProps) => {
        sheet.props = props;
        return props.id === null ? null : (
            <p>
                Sheet {String(props.id)} named "{props.name}" in project{" "}
                {String(props.draftProjectId)}
            </p>
        );
    },
}));

let backend: FakeBackend;
let checkout: StoredProject;
let billing: StoredProject;

beforeEach(() => {
    invoke.mockReset();
    sheet.props = null;
    backend = new FakeBackend();
    checkout = backend.seedProject("Checkout");
    billing = backend.seedProject("Billing");
    invoke.mockImplementation(backend.handle);
});

function renderList(projectId: number | null) {
    render(
        <MemoryRouter>
            <Toaster toastManager={toast}>
                <FailureToastProvider>
                    <DeleteProvider>
                        <ProjectInitiatives projectId={projectId} />
                    </DeleteProvider>
                </FailureToastProvider>
            </Toaster>
        </MemoryRouter>,
    );
}

function list() {
    return screen.getByRole("region", { name: "Initiatives" });
}

/** The text of each row, from the top. */
function rows(): string[] {
    return within(list())
        .queryAllByRole("listitem")
        .map((row) => row.textContent ?? "");
}

function summaryOf(
    initiative: StoredInitiative,
    changes: Partial<InitiativeSummary> = {},
): InitiativeSummary {
    // The summary has no description.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { description, ...rest } = initiative;
    return { ...rest, ...changes };
}

function currentSheet(): SheetProps {
    if (sheet.props === null) throw new Error("The sheet did not render");
    return sheet.props;
}

describe("ProjectInitiatives", () => {
    it("shows the initiatives of the project in the order of the roadmap", async () => {
        backend.seedInitiative({
            name: "Won",
            project: checkout,
            completed: true,
        });
        backend.seedInitiative({ name: "Someday", project: checkout });
        backend.seedInitiative({
            name: "Soon",
            project: checkout,
            horizon: "next",
        });
        backend.seedInitiative({
            name: "",
            project: checkout,
            horizon: "now",
        });
        backend.seedInitiative({
            name: "Other",
            project: billing,
            horizon: "now",
        });
        renderList(checkout.id);

        await waitFor(() =>
            expect(rows()).toEqual([
                "Untitled initiative",
                "Soon",
                "Someday",
                "Won",
            ]),
        );
        for (const row of within(list()).getAllByRole("listitem")) {
            expect(within(row).getByRole("button")).toBeInTheDocument();
        }
    });

    it("shows No initiatives and a disabled New initiative for a draft, and loads nothing", () => {
        renderList(null);

        expect(within(list()).getByText("No initiatives")).toBeInTheDocument();
        expect(
            within(list()).getByRole("button", { name: "New initiative" }),
        ).toBeDisabled();
        expect(invoke).not.toHaveBeenCalled();
    });

    it("opens the sheet of an initiative from its row", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        const user = userEvent.setup();
        renderList(checkout.id);

        await user.click(
            await within(list()).findByRole("button", { name: /^Launch/ }),
        );

        expect(
            screen.getByText(
                `Sheet ${launch.id} named "Launch" in project ${checkout.id}`,
            ),
        ).toBeInTheDocument();
    });

    it("opens a draft in the project with New initiative, and goes on with the created initiative", async () => {
        const user = userEvent.setup();
        renderList(checkout.id);
        await within(list()).findByText("No initiatives");

        await user.click(
            within(list()).getByRole("button", { name: "New initiative" }),
        );
        expect(
            screen.getByText(`Sheet new named "" in project ${checkout.id}`),
        ).toBeInTheDocument();

        const created = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        act(() => {
            currentSheet().onCreated(created.id);
            currentSheet().onSaved(summaryOf(created));
        });

        expect(rows()).toEqual(["Launch"]);
        expect(
            screen.getByText(
                `Sheet ${created.id} named "Launch" in project ${checkout.id}`,
            ),
        ).toBeInTheDocument();
    });

    it("replaces the row of a saved initiative, and removes it when the initiative moves to another project", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
            horizon: "now",
        });
        renderList(checkout.id);
        await waitFor(() => expect(rows()).toEqual(["Launch"]));

        act(() =>
            currentSheet().onSaved(summaryOf(launch, { name: "Launch v2" })),
        );
        expect(rows()).toEqual(["Launch v2"]);

        act(() =>
            currentSheet().onSaved(
                summaryOf(launch, { projectId: billing.id }),
            ),
        );
        expect(rows()).toEqual([]);
        expect(within(list()).getByText("No initiatives")).toBeInTheDocument();
    });

    it("keeps the name of the open initiative after it moves to another project", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
            horizon: "now",
        });
        const user = userEvent.setup();
        renderList(checkout.id);
        await user.click(
            await within(list()).findByRole("button", { name: /^Launch/ }),
        );

        act(() =>
            currentSheet().onSaved(
                summaryOf(launch, { projectId: billing.id }),
            ),
        );
        expect(currentSheet().name).toBe("Launch");

        act(() =>
            currentSheet().onSaved(
                summaryOf(launch, {
                    projectId: billing.id,
                    name: "Launch v2",
                }),
            ),
        );
        expect(currentSheet().name).toBe("Launch v2");
    });

    it("removes a deleted initiative, and loads the list again when Undo restores it", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
            horizon: "now",
        });
        const user = userEvent.setup();
        renderList(checkout.id);
        await user.click(
            await within(list()).findByRole("button", { name: /^Launch/ }),
        );

        await act(() => currentSheet().onDelete(launch.id, "Launch"));

        expect(rows()).toEqual([]);
        expect(currentSheet().id).toBeNull();
        // The row that opened the sheet is gone, so the focus goes to New initiative.
        expect(currentSheet().finalFocus?.current).toBe(
            within(list()).getByRole("button", { name: "New initiative" }),
        );
        const notifications = screen.getByRole("region", {
            name: "Notifications",
        });
        await user.click(
            await within(notifications).findByRole("button", { name: "Undo" }),
        );
        await waitFor(() => expect(rows()).toEqual(["Launch"]));
    });

    it("keeps the row and shows a failure toast when the delete fails", async () => {
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
            horizon: "now",
        });
        backend.failing.add("delete_initiative");
        const user = userEvent.setup();
        renderList(checkout.id);
        await user.click(
            await within(list()).findByRole("button", { name: /^Launch/ }),
        );

        await act(() => currentSheet().onDelete(launch.id, "Launch"));

        expect(
            await within(
                screen.getByRole("region", { name: "Notifications" }),
            ).findByText("Couldn't delete the initiative. Try again."),
        ).toBeInTheDocument();
        expect(rows()).toEqual(["Launch"]);
        expect(currentSheet().id).toBe(launch.id);
    });

    it("says so when the initiatives cannot be loaded, and loads them again on Retry", async () => {
        backend.seedInitiative({ name: "Launch", project: checkout });
        backend.failingOnce.add("list_initiatives");
        const user = userEvent.setup();
        renderList(checkout.id);

        expect(
            await within(list()).findByText("Couldn't load initiatives"),
        ).toBeInTheDocument();
        await user.click(within(list()).getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(rows()).toEqual(["Launch"]));
    });
});
