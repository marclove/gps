import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveProvider } from "@/components/archive-provider";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import type { InitiativeSummary } from "@/lib/initiatives";
import type { Meeting } from "@/lib/meetings";
import { MeetingInitiativeSelect } from "./meeting-initiative-select";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function summary(
    id: number,
    name: string,
    fields: Partial<InitiativeSummary> = {},
): InitiativeSummary {
    return {
        id,
        name,
        raciRole: null,
        horizon: "now",
        position: id - 1,
        createdAt: "2026-09-24T10:00:00.000Z",
        updatedAt: "2026-09-24T10:00:00.000Z",
        completedAt: null,
        archivedAt: null,
        ...fields,
    };
}

function meeting(initiativeId: number | null): Meeting {
    return {
        id: 7,
        name: "Weekly sync",
        date: "2026-09-24",
        notes: "",
        initiativeId,
        createdAt: "2026-09-24T10:00:00.000Z",
        updatedAt: "2026-09-24T10:00:00.000Z",
    };
}

const LAUNCH = summary(1, "Launch");
const PILOT = summary(2, "Pilot");

/** Renders the select inside the providers of the toasts that report its failures. */
function element(initiativeId: number | null = null) {
    return (
        <Toaster toastManager={toast}>
            <FailureToastProvider>
                <ArchiveProvider>
                    <MeetingInitiativeSelect
                        meetingId={7}
                        initiativeId={initiativeId}
                    />
                </ArchiveProvider>
            </FailureToastProvider>
        </Toaster>
    );
}

function select() {
    return screen.getByRole<HTMLSelectElement>("combobox", {
        name: "Meeting initiative",
    });
}

beforeEach(() => {
    invoke.mockReset();
});

describe("MeetingInitiativeSelect", () => {
    it("shows the empty choice, then the initiatives in labeled groups", async () => {
        invoke.mockImplementation((command: string) =>
            command === "list_initiatives"
                ? Promise.resolve([
                      LAUNCH,
                      PILOT,
                      summary(3, "Won", {
                          completedAt: "2026-09-25T10:00:00.000Z",
                      }),
                      summary(4, "Old", {
                          archivedAt: "2026-09-25T10:00:00.000Z",
                      }),
                  ])
                : Promise.reject(`unexpected command ${command}`),
        );
        render(element(4));
        await waitFor(() => expect(select()).toBeEnabled());

        const children = Array.from(select().children);
        expect(children[0]).toBeInstanceOf(HTMLOptionElement);
        expect((children[0] as HTMLOptionElement).value).toBe("");
        // The deleted initiative that the meeting is assigned to is the last choice,
        // outside the groups.
        const last = children[children.length - 1] as HTMLOptionElement;
        expect(last).toBeInstanceOf(HTMLOptionElement);
        expect(last.text).toBe("Old");
        expect(select()).toHaveValue("4");
        const groups = children.slice(1, -1) as HTMLOptGroupElement[];
        expect(groups.map((group) => group.label)).toEqual([
            "Now",
            "Completed",
        ]);
        expect(
            groups.map((group) =>
                Array.from(group.children).map(
                    (option) => (option as HTMLOptionElement).text,
                ),
            ),
        ).toEqual([["Launch", "Pilot"], ["Won"]]);
    });

    it("keeps the latest choice without a toast when an earlier save fails after it", async () => {
        let rejectFirst: (reason: unknown) => void = () => {};
        let assignCalls = 0;
        invoke.mockImplementation(
            (command: string, args: Record<string, unknown> = {}) => {
                switch (command) {
                    case "list_initiatives":
                        return Promise.resolve([LAUNCH, PILOT]);
                    case "set_meeting_initiative":
                        assignCalls += 1;
                        if (assignCalls === 1) {
                            return new Promise((_, reject) => {
                                rejectFirst = reject;
                            });
                        }
                        return Promise.resolve(
                            meeting(args.initiativeId as number | null),
                        );
                    default:
                        return Promise.reject(`unexpected command ${command}`);
                }
            },
        );
        const user = userEvent.setup();
        const { rerender } = render(element());
        await waitFor(() => expect(select()).toBeEnabled());

        await user.selectOptions(select(), "Launch");
        await user.selectOptions(select(), "Pilot");
        await waitFor(() => expect(assignCalls).toBe(2));
        await act(async () => rejectFirst("database is locked"));

        expect(select()).toHaveValue(String(PILOT.id));
        // The newer choice is saved, so the failure of the older choice is not reported.
        expect(
            within(
                screen.getByRole("region", { name: "Notifications" }),
            ).queryByText("Couldn't assign the initiative. Try again."),
        ).not.toBeInTheDocument();

        // A new render of the row, as when the editor page renders again, keeps the choice.
        rerender(element());
        await waitFor(() => expect(select()).toBeEnabled());
        expect(select()).toHaveValue(String(PILOT.id));
    });

    it("keeps the latest choice when an earlier save fails before it ends", async () => {
        let rejectFirst: (reason: unknown) => void = () => {};
        let resolveSecond: (meeting: Meeting) => void = () => {};
        let assignCalls = 0;
        invoke.mockImplementation((command: string) => {
            switch (command) {
                case "list_initiatives":
                    return Promise.resolve([LAUNCH, PILOT]);
                case "set_meeting_initiative":
                    assignCalls += 1;
                    if (assignCalls === 1) {
                        return new Promise((_, reject) => {
                            rejectFirst = reject;
                        });
                    }
                    return new Promise((resolve) => {
                        resolveSecond = resolve;
                    });
                default:
                    return Promise.reject(`unexpected command ${command}`);
            }
        });
        const user = userEvent.setup();
        render(element());
        await waitFor(() => expect(select()).toBeEnabled());

        await user.selectOptions(select(), "Launch");
        await user.selectOptions(select(), "Pilot");
        await waitFor(() => expect(assignCalls).toBe(2));

        // The first save fails while the second is not done yet.
        await act(async () => rejectFirst("database is locked"));
        expect(select()).toHaveValue(String(PILOT.id));

        await act(async () => resolveSecond(meeting(PILOT.id)));

        expect(select()).toHaveValue(String(PILOT.id));
        await waitFor(() =>
            expect(
                within(
                    screen.getByRole("region", { name: "Notifications" }),
                ).queryByText("Couldn't assign the initiative. Try again."),
            ).not.toBeInTheDocument(),
        );
    });

    it("shows an earlier choice that is saved after the latest save fails", async () => {
        let resolveFirst: (meeting: Meeting) => void = () => {};
        let rejectSecond: (reason: unknown) => void = () => {};
        let assignCalls = 0;
        invoke.mockImplementation((command: string) => {
            switch (command) {
                case "list_initiatives":
                    return Promise.resolve([LAUNCH, PILOT]);
                case "set_meeting_initiative":
                    assignCalls += 1;
                    if (assignCalls === 1) {
                        return new Promise((resolve) => {
                            resolveFirst = resolve;
                        });
                    }
                    return new Promise((_, reject) => {
                        rejectSecond = reject;
                    });
                default:
                    return Promise.reject(`unexpected command ${command}`);
            }
        });
        const user = userEvent.setup();
        render(element());
        await waitFor(() => expect(select()).toBeEnabled());

        await user.selectOptions(select(), "Launch");
        await user.selectOptions(select(), "Pilot");
        await waitFor(() => expect(assignCalls).toBe(2));

        await act(async () => rejectSecond("database is locked"));
        await act(async () => resolveFirst(meeting(LAUNCH.id)));

        // The database holds the first choice, so the select box shows it.
        expect(select()).toHaveValue(String(LAUNCH.id));
    });
});
