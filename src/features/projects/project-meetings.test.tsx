import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { DeleteProvider } from "@/components/delete-provider";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { formatMeetingDate } from "@/lib/dates";
import {
    FakeRoadmapBackend,
    type StoredProject,
} from "@/test/fake-roadmap-backend";
import { ProjectMeetings } from "./project-meetings";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeRoadmapBackend;
let checkout: StoredProject;
let billing: StoredProject;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeRoadmapBackend();
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
                        <ProjectMeetings projectId={projectId} />
                    </DeleteProvider>
                </FailureToastProvider>
            </Toaster>
        </MemoryRouter>,
    );
}

function list() {
    return screen.getByRole("region", { name: "Meetings" });
}

describe("ProjectMeetings", () => {
    it("lists the meetings about the project, newest first, with links to their editor pages", async () => {
        const kickoff = backend.seedMeeting("Kickoff", [], {
            project: checkout,
            date: "2026-09-20",
        });
        const untitled = backend.seedMeeting("", [], {
            project: checkout,
            date: "2026-09-24",
        });
        backend.seedMeeting("Billing sync", [], { project: billing });
        backend.seedMeeting("1:1");
        renderList(checkout.id);

        await waitFor(() =>
            expect(within(list()).getAllByRole("listitem")).toHaveLength(2),
        );
        const links = within(list()).getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual([
            `Untitled meeting${formatMeetingDate("2026-09-24")}`,
            `Kickoff${formatMeetingDate("2026-09-20")}`,
        ]);
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            `/meetings/${untitled.id}`,
            `/meetings/${kickoff.id}`,
        ]);
    });

    it("says No meetings when the project has none", async () => {
        backend.seedMeeting("Billing sync", [], { project: billing });
        renderList(checkout.id);

        expect(
            await within(list()).findByText("No meetings"),
        ).toBeInTheDocument();
    });

    it("says No meetings for a draft, and loads nothing", () => {
        renderList(null);

        expect(within(list()).getByText("No meetings")).toBeInTheDocument();
        expect(invoke).not.toHaveBeenCalled();
    });

    it("says so when the meetings cannot be loaded, and loads them again on Retry", async () => {
        backend.seedMeeting("Kickoff", [], { project: checkout });
        // The first command is the load of the list.
        invoke.mockRejectedValueOnce("database is locked");
        const user = userEvent.setup();
        renderList(checkout.id);

        expect(
            await within(list()).findByText("Couldn't load meetings"),
        ).toBeInTheDocument();
        await user.click(within(list()).getByRole("button", { name: "Retry" }));

        expect(
            await within(list()).findByRole("link", { name: /^Kickoff/ }),
        ).toBeInTheDocument();
    });
});
