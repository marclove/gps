import { invoke } from "@tauri-apps/api/core";

/** One meeting, with its notes. The backend type is `Meeting` in `src-tauri/src/meetings.rs`. */
export type Meeting = {
    id: number;
    name: string;
    /** The calendar date of the meeting, in the format `YYYY-MM-DD`. */
    date: string;
    /** The notes, as Markdown. */
    notes: string;
    /** The time when the meeting was created, as an RFC 3339 timestamp in UTC. */
    createdAt: string;
    /** The time when the meeting was last changed, as an RFC 3339 timestamp in UTC. */
    updatedAt: string;
};

/** The part of a meeting that the list of meetings shows. */
export type MeetingSummary = Pick<
    Meeting,
    "id" | "name" | "date" | "updatedAt"
>;

/** The fields of a meeting that the user can change. */
export type MeetingChanges = Pick<Meeting, "name" | "date" | "notes">;

/** The name that the backend gives a new meeting. Also shown for a meeting with an empty name. */
export const DEFAULT_MEETING_NAME = "Untitled meeting";

/** Returns summaries of all meetings, with the newest date first. */
export function listMeetings(): Promise<MeetingSummary[]> {
    return invoke<MeetingSummary[]>("list_meetings");
}

/** Creates a meeting with the default name and empty notes on the given date (`YYYY-MM-DD`). */
export function createMeeting(date: string): Promise<Meeting> {
    return invoke<Meeting>("create_meeting", { date });
}

/** Returns the meeting with the given identifier, or `null` if it does not exist. */
export function getMeeting(id: number): Promise<Meeting | null> {
    return invoke<Meeting | null>("get_meeting", { id });
}

/** Replaces the name, date, and notes of a meeting and returns the stored meeting. */
export function updateMeeting(
    id: number,
    changes: MeetingChanges,
): Promise<Meeting> {
    return invoke<Meeting>("update_meeting", { id, ...changes });
}

/** Returns the name to show for a meeting. A meeting with an empty name shows the default name. */
export function displayName(name: string): string {
    return name.trim() === "" ? DEFAULT_MEETING_NAME : name;
}
