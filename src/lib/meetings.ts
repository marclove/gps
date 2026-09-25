import { invoke } from "@tauri-apps/api/core";

/** The part of a meeting that the list of meetings shows. The backend type is `MeetingSummary` in `src-tauri/src/meetings.rs`. */
export type MeetingSummary = {
    id: number;
    name: string;
    /** The calendar date of the meeting, in the format `YYYY-MM-DD`. */
    date: string;
    /** The time when the meeting was last changed, as an RFC 3339 timestamp in UTC. */
    updatedAt: string;
};

/** The name that the backend gives a new meeting. Also shown for a meeting with an empty name. */
export const DEFAULT_MEETING_NAME = "Untitled meeting";

/** Returns summaries of all meetings, with the newest date first. */
export function listMeetings(): Promise<MeetingSummary[]> {
    return invoke<MeetingSummary[]>("list_meetings");
}

/** Returns the name to show for a meeting. A meeting with an empty name shows the default name. */
export function displayName(name: string): string {
    return name.trim() === "" ? DEFAULT_MEETING_NAME : name;
}
