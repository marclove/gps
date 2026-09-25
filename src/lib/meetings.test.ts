import { beforeEach, describe, expect, it, vi } from "vitest";
import { displayName, listMeetings } from "./meetings";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue([]);
});

describe("meeting commands", () => {
    it("lists meetings with the list_meetings command", async () => {
        await listMeetings();

        expect(invoke).toHaveBeenCalledWith("list_meetings");
    });
});

describe("displayName", () => {
    it("shows the default name for an empty or blank name", () => {
        expect(displayName("")).toBe("Untitled meeting");
        expect(displayName("   ")).toBe("Untitled meeting");
        expect(displayName("Weekly sync")).toBe("Weekly sync");
    });
});
