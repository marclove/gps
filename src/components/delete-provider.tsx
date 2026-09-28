import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useToastManager } from "@/components/ui/toast";
import {
    deleteInitiative,
    initiativeDisplayName,
    restoreInitiative,
    type RestoreResult,
} from "@/lib/initiatives";
import { deleteMeeting, displayName, restoreMeeting } from "@/lib/meetings";
import {
    deleteProject,
    projectDisplayName,
    restoreProject,
    type RestoreProjectResult,
} from "@/lib/projects";
import {
    DeleteContext,
    DeleteRefusedError,
    type DeleteKind,
    type ItemToDelete,
    type RestoredItem,
} from "./use-delete";

/** How long the delete toast stays open by itself, in milliseconds. */
const TOAST_TIMEOUT = 8000;

/** The commands and the text that deleting and restoring one kind of item use. */
type KindActions = {
    /**
     * Deletes the item with the given identifier and the given shown name. Gives
     * `null` when the item is deleted. When the backend refuses the delete, gives the
     * text of the failure toast, and nothing is deleted.
     */
    remove: (
        id: number,
        shownName: string,
    ) => Promise<{ refusedText: string } | null>;
    /**
     * Restores the item with the given identifier. Gives `nameTaken` if the backend
     * does not restore the item because another item has its name.
     */
    restore: (id: number) => Promise<RestoreResult | RestoreProjectResult>;
    /** Returns the name to show for a stored name. */
    displayName: (name: string) => string;
    /** Returns the text of the toast after a delete, for the shown name. */
    deletedText: (shownName: string) => string;
    /** The text of the toast when a restore fails. */
    restoreFailedText: string;
    /** Returns the text of the toast when another item has the name, for the shown name. */
    nameTakenText: (shownName: string) => string;
};

/** The commands and the text for each kind of item. */
const KINDS: Record<DeleteKind, KindActions> = {
    meeting: {
        remove: (id) => deleteMeeting(id).then(() => null),
        // The backend always restores a meeting, because meeting names need not be
        // unique.
        restore: (id) =>
            restoreMeeting(id).then(() => ({ status: "restored" })),
        displayName,
        deletedText: (shownName) => `Deleted "${shownName}".`,
        restoreFailedText: "Couldn't restore the meeting. Try again.",
        nameTakenText: () => "Couldn't restore the meeting. Try again.",
    },
    initiative: {
        remove: (id) => deleteInitiative(id).then(() => null),
        restore: restoreInitiative,
        displayName: initiativeDisplayName,
        deletedText: (shownName) => `Deleted "${shownName}".`,
        restoreFailedText: "Couldn't restore the initiative. Try again.",
        nameTakenText: (shownName) =>
            `Couldn't restore "${shownName}" because another initiative has that name.`,
    },
    project: {
        remove: async (id, shownName) => {
            const result = await deleteProject(id);
            return result.status === "hasInitiatives"
                ? {
                      refusedText: `Couldn't delete "${shownName}" because it still has initiatives.`,
                  }
                : null;
        },
        restore: restoreProject,
        displayName: projectDisplayName,
        deletedText: (shownName) => `Deleted "${shownName}".`,
        restoreFailedText: "Couldn't restore the project. Try again.",
        nameTakenText: (shownName) =>
            `Couldn't restore "${shownName}" because another project has that name.`,
    },
};

/**
 * Gives every page the delete action and the delete toast.
 *
 * This component owns deleting an item and restoring it with Undo, so the toast can
 * stay open after the page that started the action closes. It shows at most one
 * delete toast for all kinds of items. Place it inside the toast provider.
 */
export function DeleteProvider({ children }: { children: ReactNode }) {
    // Bound to the toast provider that wraps this component, so the delete toast
    // always reaches the viewport that provider renders, even if the application
    // passes a different manager to a different toast provider elsewhere.
    const { add, close, update } = useToastManager();
    const [version, setVersion] = useState(0);
    const [restored, setRestored] = useState<RestoredItem | null>(null);
    // The identifier of the toast for the item deleted most recently, or `null`
    // when no delete toast is open.
    const openToastId = useRef<string | null>(null);
    // Counts every delete. A restore reads this number when it starts and compares it
    // again when it finishes, so a restore for a toast that a later delete already
    // replaced does not set `restored` for the wrong item.
    const deleteCount = useRef(0);
    // The identifiers of toasts with a restore in progress, so clicking Undo again on
    // the same toast while the first call runs has no effect.
    const restoringToasts = useRef(new Set<string>());
    // Holds the latest `restore` function, so the retry button of a failed restore can
    // call it without `restore` referring to itself while it is being declared.
    const restoreRef =
        useRef<
            (item: ItemToDelete, toastId: string, generation: number) => void
        >(null);

    const restore = useCallback(
        (item: ItemToDelete, toastId: string, generation: number) => {
            if (restoringToasts.current.has(toastId)) return;
            restoringToasts.current.add(toastId);
            const actions = KINDS[item.kind];
            actions.restore(item.id).then(
                (result) => {
                    restoringToasts.current.delete(toastId);
                    if (result.status === "nameTaken") {
                        // Nothing changed, so `version` and `restored` stay the
                        // same. Undo is removed, because trying again cannot
                        // succeed.
                        update(toastId, {
                            title: actions.nameTakenText(
                                actions.displayName(item.name),
                            ),
                            timeout: TOAST_TIMEOUT,
                            actionProps: undefined,
                        });
                        return;
                    }
                    close(toastId);
                    setVersion((value) => value + 1);
                    if (deleteCount.current === generation) {
                        setRestored({ kind: item.kind, id: item.id });
                    }
                },
                () => {
                    restoringToasts.current.delete(toastId);
                    update(toastId, {
                        title: actions.restoreFailedText,
                        timeout: TOAST_TIMEOUT,
                        actionProps: {
                            children: "Undo",
                            onClick: () =>
                                restoreRef.current?.(item, toastId, generation),
                        },
                    });
                },
            );
        },
        [close, update],
    );
    useEffect(() => {
        restoreRef.current = restore;
    }, [restore]);

    const deleteItem = useCallback(
        async (item: ItemToDelete) => {
            const actions = KINDS[item.kind];
            const shownName = actions.displayName(item.name);
            const refusal = await actions.remove(item.id, shownName);
            if (refusal) throw new DeleteRefusedError(refusal.refusedText);
            if (openToastId.current) close(openToastId.current);
            deleteCount.current += 1;
            const generation = deleteCount.current;
            const id = add({
                title: actions.deletedText(shownName),
                timeout: TOAST_TIMEOUT,
                actionProps: {
                    children: "Undo",
                    onClick: () => restore(item, id, generation),
                },
            });
            openToastId.current = id;
            setVersion((value) => value + 1);
        },
        [add, close, restore],
    );

    return (
        <DeleteContext.Provider value={{ deleteItem, version, restored }}>
            {children}
        </DeleteContext.Provider>
    );
}
