import { createContext, useContext } from "react";

/** A kind of item that the user can archive. */
export type ArchiveKind = "meeting" | "initiative";

/** The kind, identifier, and name of an item to archive. */
export type ItemToArchive = {
    kind: ArchiveKind;
    id: number;
    /**
     * The item's raw name, exactly as stored. It may be empty; the archive toast
     * shows the default name of the kind for an empty name, such as "Untitled
     * meeting".
     */
    name: string;
};

/** The kind and identifier of an item a restore just brought back. */
export type RestoredItem = { kind: ArchiveKind; id: number };

/** The archive action and its state, shared by every page. */
export type ArchiveApi = {
    /**
     * Archives the item and shows the archive toast. The toast says "Archived" for a
     * meeting and "Deleted" for an initiative.
     *
     * Rejects if the item cannot be archived. It does not show the toast in that
     * case, so the caller can show its own failure message.
     */
    archive: (item: ItemToArchive) => Promise<void>;
    /**
     * Counts every archive and restore of every kind, so a page knows its list is out
     * of date. A restore that the backend refuses does not count.
     */
    version: number;
    /**
     * The item a restore just brought back, or `null` if none is pending. A page must
     * examine the kind, because a meeting and an initiative can have the same
     * identifier.
     */
    restored: RestoredItem | null;
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
