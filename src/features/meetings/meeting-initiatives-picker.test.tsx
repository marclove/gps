import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteProvider } from "@/components/delete-provider";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import type { InitiativeSummary } from "@/lib/initiatives";
import { MeetingInitiativesPicker } from "./meeting-initiatives-picker";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const OLD: InitiativeSummary = {
    id: 1,
    projectId: 1,
    name: "Old",
    raciRole: null,
    horizon: "now",
    rank: "8",
    createdAt: "2026-09-24T10:00:00.000Z",
    updatedAt: "2026-09-24T10:00:00.000Z",
    completedAt: null,
    deletedAt: "2026-09-25T10:00:00.000Z",
};

const NEXT: InitiativeSummary = {
    ...OLD,
    id: 2,
    name: "Pilot",
    deletedAt: null,
};

const PREVIOUS: InitiativeSummary = {
    ...OLD,
    id: 3,
    name: "Launch",
    deletedAt: null,
};

/** The initiatives that the backend lists. */
let initiatives: InitiativeSummary[];

/** The reply to the removal, which the test ends when it needs to. */
let removal: { resolve: () => void; reject: () => void };

beforeEach(() => {
    initiatives = [OLD];
    invoke.mockReset();
    invoke.mockImplementation((command: string) => {
        if (command === "list_initiatives") return Promise.resolve(initiatives);
        return new Promise((resolve, reject) => {
            removal = {
                resolve: () => resolve({}),
                reject: () => reject(new Error("refused")),
            };
        });
    });
});

/** Renders the row with a meeting that covers the deleted initiative, and opens the popover. */
async function openPopover() {
    const user = userEvent.setup();
    render(
        <Toaster toastManager={toast}>
            <FailureToastProvider>
                <DeleteProvider>
                    <MeetingInitiativesPicker
                        meetingId={7}
                        projectId={1}
                        initiativeIds={[1]}
                    />
                </DeleteProvider>
            </FailureToastProvider>
        </Toaster>,
    );
    const button = screen.getByRole("button", { name: "Choose initiatives" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    const popover = await screen.findByRole("dialog", {
        name: "Choose initiatives",
    });
    return {
        user,
        popover,
        checkbox: within(popover).getByRole("checkbox", {
            name: "Old (deleted)",
        }),
    };
}

describe("MeetingInitiativesPicker", () => {
    it("disables the checkbox of a deleted initiative while its removal is saved", async () => {
        const { user, checkbox } = await openPopover();
        expect(checkbox).toBeEnabled();

        await user.click(checkbox);

        expect(checkbox).not.toBeChecked();
        expect(checkbox).toHaveAttribute("aria-disabled", "true");
        await user.click(checkbox);
        expect(invoke).not.toHaveBeenCalledWith(
            "add_meeting_initiative",
            expect.anything(),
        );

        removal.resolve();
        await waitFor(() => expect(checkbox).not.toBeInTheDocument());
    });

    it("enables the checkbox of a deleted initiative again when its removal fails", async () => {
        const { user, checkbox } = await openPopover();

        await user.click(checkbox);
        removal.reject();

        await waitFor(() => expect(checkbox).toBeChecked());
        expect(checkbox).not.toHaveAttribute("aria-disabled", "true");
    });

    it("moves the focus to the next checkbox when the removal of a deleted initiative is saved", async () => {
        initiatives = [OLD, NEXT, PREVIOUS];
        const { user, popover, checkbox } = await openPopover();

        await user.click(checkbox);
        expect(checkbox).toHaveFocus();
        removal.resolve();

        await waitFor(() => expect(checkbox).not.toBeInTheDocument());
        expect(
            within(popover).getByRole("checkbox", { name: "Pilot" }),
        ).toHaveFocus();
    });

    it("moves the focus to the previous checkbox when the deleted initiative was the last", async () => {
        initiatives = [OLD, PREVIOUS];
        const { user, popover, checkbox } = await openPopover();

        await user.click(checkbox);
        removal.resolve();

        await waitFor(() => expect(checkbox).not.toBeInTheDocument());
        expect(
            within(popover).getByRole("checkbox", { name: "Launch" }),
        ).toHaveFocus();
    });

    it("moves the focus to the popover when no checkbox is left", async () => {
        const { user, popover, checkbox } = await openPopover();

        await user.click(checkbox);
        removal.resolve();

        await waitFor(() => expect(checkbox).not.toBeInTheDocument());
        expect(popover).toHaveFocus();
    });
});
