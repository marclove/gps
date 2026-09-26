import { createContext, useContext } from "react";

/** The identifier and name of a meeting to archive. */
export type MeetingToArchive = { id: number; name: string };

/** The identifier of a meeting a restore just brought back. */
export type RestoredMeeting = { id: number };

/** The archive action and its state, shared by every page. */
export type ArchiveApi = {
    /**
     * Archives the meeting and shows the archive toast.
     *
     * Rejects if the meeting cannot be archived. It does not show the toast in that
     * case, so the caller can show its own message next to the control that failed.
     */
    archive: (meeting: MeetingToArchive) => Promise<void>;
    /** Counts every archive and restore, so a page knows its list is out of date. */
    version: number;
    /** The meeting a restore just brought back, or `null` if none is pending. */
    restored: RestoredMeeting | null;
};

/** Holds the archive action and its state. Provided by `ArchiveProvider`. */
export const ArchiveContext = createContext<ArchiveApi | null>(null);

/** Returns the archive action and its state. Must be used inside `ArchiveProvider`. */
export function useArchive(): ArchiveApi {
    const api = useContext(ArchiveContext);
    if (!api) {
        throw new Error("useArchive must be used inside ArchiveProvider");
    }
    return api;
}
