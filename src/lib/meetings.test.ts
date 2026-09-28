import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    deleteMeeting,
    createMeeting,
    displayName,
    getMeeting,
    listMeetings,
    setMeetingInitiative,
    restoreMeeting,
    updateMeeting,
} from "./meetings";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
});

describe("meeting commands", () => {
    it("calls the backend commands with their arguments", async () => {
        await listMeetings();
        await createMeeting("2026-09-24");
        await getMeeting(3);
        await updateMeeting(3, {
            name: "Weekly sync",
            date: "2026-09-25",
            notes: "- [ ] Send notes",
        });
        await deleteMeeting(3);
        await restoreMeeting(3);
        await setMeetingInitiative(3, 7);
        await setMeetingInitiative(3, null);

        expect(invoke.mock.calls).toEqual([
            ["list_meetings"],
            ["create_meeting", { date: "2026-09-24" }],
            ["get_meeting", { id: 3 }],
            [
                "update_meeting",
                {
                    id: 3,
                    name: "Weekly sync",
                    date: "2026-09-25",
                    notes: "- [ ] Send notes",
                },
            ],
            ["delete_meeting", { id: 3 }],
            ["restore_meeting", { id: 3 }],
            ["set_meeting_initiative", { id: 3, initiativeId: 7 }],
            ["set_meeting_initiative", { id: 3, initiativeId: null }],
        ]);
    });
});

describe("displayName", () => {
    it("shows the default name for an empty or blank name", () => {
        expect(displayName("")).toBe("Untitled meeting");
        expect(displayName("   ")).toBe("Untitled meeting");
        expect(displayName("Weekly sync")).toBe("Weekly sync");
    });
});
