import { createContext, useContext } from "react";

/** A kind of item that the user can delete. */
export type DeleteKind = "meeting" | "initiative" | "project" | "task";

/**
 * The error of `deleteItem` when the backend refuses the delete, for example because a
 * project still has initiatives. Nothing was deleted. The message is the text for the
 * failure toast.
 */
export class DeleteRefusedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DeleteRefusedError";
    }
}

/** The kind, identifier, and name of an item to delete. */
export type ItemToDelete = {
    kind: DeleteKind;
    id: number;
    /**
     * The item's raw name, exactly as stored. It may be empty; the delete toast
     * shows the default name of the kind for an empty name, such as "Untitled
     * meeting". For a task, the caller can give the shown name instead, such as
     * "Untitled action item" for an action item with an empty text.
     */
    name: string;
};

/** The kind and identifier of an item a restore just brought back. */
export type RestoredItem = { kind: DeleteKind; id: number };

/** The delete action and its state, shared by every page. */
export type DeleteApi = {
    /**
     * Deletes the item and shows the delete toast. The toast says "Deleted" and
     * the name of the item.
     *
     * Rejects if the item cannot be deleted. It does not show the toast in that
     * case, so the caller can show its own failure message. When the backend refuses
     * the delete, it rejects with `DeleteRefusedError`, whose message the caller
     * shows.
     */
    deleteItem: (item: ItemToDelete) => Promise<void>;
    /**
     * Counts every delete and restore of every kind, so a page knows its list is out
     * of date. A restore that the backend refuses does not count.
     */
    version: number;
    /**
     * The item a restore just brought back, or `null` if none is pending. A page must
     * examine the kind, because items of different kinds can have the same
     * identifier.
     */
    restored: RestoredItem | null;
};

/** Holds the delete action and its state. Provided by `DeleteProvider`. */
export const DeleteContext = createContext<DeleteApi | null>(null);

/** Returns the delete action and its state. Must be used inside `DeleteProvider`. */
export function useDelete(): DeleteApi {
    const api = useContext(DeleteContext);
    if (!api) {
        throw new Error("useDelete must be used inside DeleteProvider");
    }
    return api;
}
