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
    /** Restores the item with the given identifier. */
    unarchive: (id: number) => Promise<void>;
    /** Returns the name to show for a stored name. */
    displayName: (name: string) => string;
    /** The text of the toast when a restore fails. */
    restoreFailedText: string;
};

/** The commands and the text for each kind of item. */
const KINDS: Record<ArchiveKind, KindActions> = {
    meeting: {
        archive: archiveMeeting,
        unarchive: unarchiveMeeting,
        displayName,
        restoreFailedText: "Couldn't restore the meeting. Try again.",
    },
    initiative: {
        archive: archiveInitiative,
        unarchive: unarchiveInitiative,
        displayName: initiativeDisplayName,
        restoreFailedText: "Couldn't restore the initiative. Try again.",
    },
};

/**
 * Gives every page the archive action and the archive toast.
 *
 * This component owns archiving an item and restoring it with Undo, so the toast can
 * stay open after the page that started the action closes. Place it inside the toast
 * provider.
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
            KINDS[item.kind].unarchive(item.id).then(
                () => {
                    restoringToasts.current.delete(toastId);
                    close(toastId);
                    setVersion((value) => value + 1);
                    if (archiveCount.current === generation) {
                        setRestored({ kind: item.kind, id: item.id });
                    }
                },
                () => {
                    restoringToasts.current.delete(toastId);
                    update(toastId, {
                        title: KINDS[item.kind].restoreFailedText,
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
                title: `Archived "${actions.displayName(item.name)}".`,
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
