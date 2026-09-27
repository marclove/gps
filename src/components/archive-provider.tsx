import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useToastManager } from "@/components/ui/toast";
import {
    archiveInitiative,
    initiativeDisplayName,
    unarchiveInitiative,
    type RestoreResult,
} from "@/lib/initiatives";
import { archiveMeeting, displayName, unarchiveMeeting } from "@/lib/meetings";
import {
    ArchiveContext,
    type ArchiveKind,
    type ItemToArchive,
    type RestoredItem,
} from "./use-archive";

/** How long the archive toast stays open by itself, in milliseconds. */
const TOAST_TIMEOUT = 8000;

/** The commands and the text that archiving and restoring one kind of item use. */
type KindActions = {
    /** Archives the item with the given identifier. */
    archive: (id: number) => Promise<void>;
    /**
     * Restores the item with the given identifier. Gives `nameTaken` if the backend
     * does not restore the item because another item has its name.
     */
    unarchive: (id: number) => Promise<RestoreResult>;
    /** Returns the name to show for a stored name. */
    displayName: (name: string) => string;
    /** Returns the text of the toast after an archive, for the shown name. */
    archivedText: (shownName: string) => string;
    /** The text of the toast when a restore fails. */
    restoreFailedText: string;
    /** Returns the text of the toast when another item has the name, for the shown name. */
    nameTakenText: (shownName: string) => string;
};

/** The commands and the text for each kind of item. */
const KINDS: Record<ArchiveKind, KindActions> = {
    meeting: {
        archive: archiveMeeting,
        // The backend always restores a meeting, because meeting names need not be
        // unique.
        unarchive: (id) =>
            unarchiveMeeting(id).then(() => ({ status: "restored" })),
        displayName,
        archivedText: (shownName) => `Archived "${shownName}".`,
        restoreFailedText: "Couldn't restore the meeting. Try again.",
        nameTakenText: () => "Couldn't restore the meeting. Try again.",
    },
    initiative: {
        archive: archiveInitiative,
        unarchive: unarchiveInitiative,
        displayName: initiativeDisplayName,
        archivedText: (shownName) => `Deleted "${shownName}".`,
        restoreFailedText: "Couldn't restore the initiative. Try again.",
        nameTakenText: (shownName) =>
            `Couldn't restore "${shownName}" because another initiative has that name.`,
    },
};

/**
 * Gives every page the archive action and the archive toast.
 *
 * This component owns archiving an item and restoring it with Undo, so the toast can
 * stay open after the page that started the action closes. It shows at most one
 * archive toast for all kinds of items. Place it inside the toast provider.
 */
export function ArchiveProvider({ children }: { children: ReactNode }) {
    // Bound to the toast provider that wraps this component, so the archive toast
    // always reaches the viewport that provider renders, even if the application
    // passes a different manager to a different toast provider elsewhere.
    const { add, close, update } = useToastManager();
    const [version, setVersion] = useState(0);
    const [restored, setRestored] = useState<RestoredItem | null>(null);
    // The identifier of the toast for the item archived most recently, or `null`
    // when no archive toast is open.
    const openToastId = useRef<string | null>(null);
    // Counts every archive. A restore reads this number when it starts and compares it
    // again when it finishes, so a restore for a toast that a later archive already
    // replaced does not set `restored` for the wrong item.
    const archiveCount = useRef(0);
    // The identifiers of toasts with a restore in progress, so clicking Undo again on
    // the same toast while the first call runs has no effect.
    const restoringToasts = useRef(new Set<string>());
    // Holds the latest `restore` function, so the retry button of a failed restore can
    // call it without `restore` referring to itself while it is being declared.
    const restoreRef =
        useRef<
            (item: ItemToArchive, toastId: string, generation: number) => void
        >(null);

    const restore = useCallback(
        (item: ItemToArchive, toastId: string, generation: number) => {
            if (restoringToasts.current.has(toastId)) return;
            restoringToasts.current.add(toastId);
            const actions = KINDS[item.kind];
            actions.unarchive(item.id).then(
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
                    if (archiveCount.current === generation) {
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

    const archive = useCallback(
        async (item: ItemToArchive) => {
            const actions = KINDS[item.kind];
            await actions.archive(item.id);
            if (openToastId.current) close(openToastId.current);
            archiveCount.current += 1;
            const generation = archiveCount.current;
            const id = add({
                title: actions.archivedText(actions.displayName(item.name)),
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
        <ArchiveContext.Provider value={{ archive, version, restored }}>
            {children}
        </ArchiveContext.Provider>
    );
}
