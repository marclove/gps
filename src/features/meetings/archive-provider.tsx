import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { toast } from "@/components/ui/toast";
import { archiveMeeting, displayName, unarchiveMeeting } from "@/lib/meetings";
import {
    ArchiveContext,
    type MeetingToArchive,
    type RestoredMeeting,
} from "./use-archive";

/** How long the archive toast stays open by itself, in milliseconds. */
const TOAST_TIMEOUT = 8000;

/**
 * Gives every page the archive action and the archive toast.
 *
 * This component owns archiving a meeting and restoring it with Undo, so the toast can
 * stay open after the page that started the action closes. Place it inside the toast
 * provider.
 */
export function ArchiveProvider({ children }: { children: ReactNode }) {
    const [version, setVersion] = useState(0);
    const [restored, setRestored] = useState<RestoredMeeting | null>(null);
    // The identifier of the toast for the meeting archived most recently, or `null`
    // when no archive toast is open.
    const openToastId = useRef<string | null>(null);
    // Counts every archive. A restore reads this number when it starts and compares it
    // again when it finishes, so a restore for a toast that a later archive already
    // replaced does not set `restored` for the wrong meeting.
    const archiveCount = useRef(0);
    // The identifiers of toasts with a restore in progress, so clicking Undo again on
    // the same toast while the first call runs has no effect.
    const restoringToasts = useRef(new Set<string>());
    // Holds the latest `restore` function, so the retry button of a failed restore can
    // call it without `restore` referring to itself while it is being declared.
    const restoreRef =
        useRef<
            (
                meeting: MeetingToArchive,
                toastId: string,
                generation: number,
            ) => void
        >(null);

    const restore = useCallback(
        (meeting: MeetingToArchive, toastId: string, generation: number) => {
            if (restoringToasts.current.has(toastId)) return;
            restoringToasts.current.add(toastId);
            unarchiveMeeting(meeting.id).then(
                () => {
                    restoringToasts.current.delete(toastId);
                    toast.close(toastId);
                    setVersion((value) => value + 1);
                    if (archiveCount.current === generation) {
                        setRestored({ id: meeting.id });
                    }
                },
                () => {
                    restoringToasts.current.delete(toastId);
                    toast.update(toastId, {
                        title: "Couldn't restore the meeting. Try again.",
                        timeout: TOAST_TIMEOUT,
                        actionProps: {
                            children: "Undo",
                            onClick: () =>
                                restoreRef.current?.(
                                    meeting,
                                    toastId,
                                    generation,
                                ),
                        },
                    });
                },
            );
        },
        [],
    );
    useEffect(() => {
        restoreRef.current = restore;
    }, [restore]);

    const archive = useCallback(
        async (meeting: MeetingToArchive) => {
            await archiveMeeting(meeting.id);
            if (openToastId.current) toast.close(openToastId.current);
            archiveCount.current += 1;
            const generation = archiveCount.current;
            const id = toast.add({
                title: `Archived "${displayName(meeting.name)}".`,
                timeout: TOAST_TIMEOUT,
                actionProps: {
                    children: "Undo",
                    onClick: () => restore(meeting, id, generation),
                },
            });
            openToastId.current = id;
            setVersion((value) => value + 1);
        },
        [restore],
    );

    return (
        <ArchiveContext.Provider value={{ archive, version, restored }}>
            {children}
        </ArchiveContext.Provider>
    );
}
