import { ArchiveIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { PageHeader } from "@/components/page-header";
import { useFailureToast } from "@/components/use-failure-toast";
import { PAGE_TITLE_CLASSES } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { formatMeetingDate, toMeetingDate } from "@/lib/dates";
import {
    createMeeting,
    displayName,
    listMeetings,
    type MeetingSummary,
} from "@/lib/meetings";
import { useArchive, type RestoredMeeting } from "./use-archive";

type ListState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; meetings: MeetingSummary[] };

/** State that the Meetings page gives the editor page when it opens a new meeting. */
export type NewMeetingState = { isNew: true };

/**
 * State that the editor page gives the Meetings page after it archives a meeting. The
 * Meetings page then moves focus to the "New note" button, because the button that the
 * user clicked is gone.
 */
export type MeetingsPageState = { focusNewNote: true };

/**
 * Records an archive so the effect that watches the list can move focus once the
 * backend truth catches up, even if another archive changes the list first.
 */
type ArchivedNeighbors = {
    /** The identifier of the archived meeting. */
    archivedId: number;
    /** The identifiers of every meeting in the list, in order, as of the archive. */
    orderedIds: number[];
};

/** The page that lists all meetings and creates new ones. */
export function MeetingsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const focusNewNote =
        (location.state as MeetingsPageState | null)?.focusNewNote === true;
    const { archive, version, restored } = useArchive();
    const [list, setList] = useState<ListState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [creating, setCreating] = useState(false);
    const [createFailed, setCreateFailed] = useState(false);
    const failureToast = useFailureToast();
    const newNoteButtonRef = useRef<HTMLButtonElement>(null);
    const meetingLinkRefs = useRef(new Map<number, HTMLAnchorElement>());
    const archiveButtonRefs = useRef(new Map<number, HTMLButtonElement>());
    // The most recent archive that is still waiting for the list to catch up, so the
    // effect below can move focus once it does. `null` means nothing is waiting.
    const archivedNeighbors = useRef<ArchivedNeighbors | null>(null);
    // The restored meeting this page has already moved focus for, so a restore that
    // happened before this page opened, or one this page already reacted to, does not
    // move focus again.
    const handledRestored = useRef<RestoredMeeting | null>(restored);
    // The identifiers of meetings with an archive in progress, so a second click on the
    // same row before the first archive finishes has no effect.
    const pendingArchiveIds = useRef(new Set<number>());

    useEffect(() => {
        if (focusNewNote) newNoteButtonRef.current?.focus();
    }, [focusNewNote]);

    useEffect(() => {
        let current = true;
        listMeetings().then(
            (meetings) => current && setList({ kind: "loaded", meetings }),
            () => current && setList({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt, version]);

    useEffect(() => {
        const neighbors = archivedNeighbors.current;
        if (!neighbors || list.kind !== "loaded") return;
        archivedNeighbors.current = null;

        // Focus the first surviving meeting that was after the archived one, in the
        // order the archive saw, or otherwise the nearest surviving one before it.
        // Using that recorded order, rather than the current list's order, is what
        // keeps the target correct when a second archive removed a meeting in
        // between: a meeting between the archived one and its recorded neighbor can
        // no longer be there to stand in for it. It does not wait for the archived
        // meeting itself to disappear from `list` first: the row it is choosing
        // between is the row after or before it, never its own.
        const currentIds = new Set(list.meetings.map((meeting) => meeting.id));
        const archivedIndex = neighbors.orderedIds.indexOf(
            neighbors.archivedId,
        );
        const after =
            archivedIndex === -1
                ? []
                : neighbors.orderedIds.slice(archivedIndex + 1);
        const before =
            archivedIndex === -1
                ? []
                : neighbors.orderedIds.slice(0, archivedIndex).reverse();
        const nextId =
            after.find((id) => currentIds.has(id)) ??
            before.find((id) => currentIds.has(id));

        if (nextId !== undefined) {
            archiveButtonRefs.current.get(nextId)?.focus();
        } else {
            newNoteButtonRef.current?.focus();
        }
    }, [list]);

    useEffect(() => {
        if (!restored || restored === handledRestored.current) return;
        if (list.kind !== "loaded") return;
        const link = meetingLinkRefs.current.get(restored.id);
        if (link) {
            link.focus();
            handledRestored.current = restored;
        }
    }, [restored, list]);

    function retry() {
        setList({ kind: "loading" });
        setAttempt((value) => value + 1);
    }

    async function createNote() {
        setCreating(true);
        setCreateFailed(false);
        try {
            const meeting = await createMeeting(toMeetingDate(new Date()));
            const state: NewMeetingState = { isNew: true };
            navigate(`/meetings/${meeting.id}`, { state });
        } catch {
            setCreateFailed(true);
            setCreating(false);
        }
    }

    async function handleArchive(meeting: MeetingSummary) {
        // Ignore a second click on the same row while its archive is still in flight,
        // so it cannot run twice.
        if (pendingArchiveIds.current.has(meeting.id)) return;
        pendingArchiveIds.current.add(meeting.id);
        try {
            await archive({ id: meeting.id, name: meeting.name });
            failureToast.clear();
            // Recorded here, from the list this render sees, rather than computing
            // the focus target itself inside the `setList` updater below: React may
            // call that updater more than once, so it must stay pure, and by the time
            // it runs another archive may already have changed the list, which would
            // make an index computed from a stale snapshot point at the wrong row.
            // The effect that watches `list` picks the actual target once the list
            // catches up, from the always-current list at that later time.
            if (list.kind === "loaded") {
                archivedNeighbors.current = {
                    archivedId: meeting.id,
                    orderedIds: list.meetings.map((candidate) => candidate.id),
                };
            }
            setList((current) => {
                if (current.kind !== "loaded") return current;
                if (
                    !current.meetings.some(
                        (candidate) => candidate.id === meeting.id,
                    )
                ) {
                    return current;
                }
                return {
                    kind: "loaded",
                    meetings: current.meetings.filter(
                        (candidate) => candidate.id !== meeting.id,
                    ),
                };
            });
        } catch {
            failureToast.show("Couldn't archive the meeting. Try again.");
        } finally {
            pendingArchiveIds.current.delete(meeting.id);
        }
    }

    return (
        // The header and the title stay in place, and the last row, which gets the
        // remaining height, scrolls.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)]">
            <PageHeader crumbs={[{ label: "Meetings" }]}>
                <Button
                    ref={newNoteButtonRef}
                    onClick={createNote}
                    disabled={creating}
                >
                    <PlusIcon />
                    New note
                </Button>
            </PageHeader>
            <div className="flex flex-col gap-4 px-6 pb-2">
                <h1 className={PAGE_TITLE_CLASSES}>Meetings</h1>
                {createFailed && (
                    <p role="alert" className="text-sm text-destructive">
                        Couldn't create a note. Try again.
                    </p>
                )}
            </div>
            {/* `pt-2` leaves room for the focus ring of the first meeting, which the
                scrolling area would cut off. The title row has 8 pixels less padding,
                so the list stays at the same position. */}
            <div className="overflow-y-auto px-6 pt-2 pb-4">
                {list.kind === "loading" && (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                )}
                {list.kind === "error" && (
                    <div className="flex items-center gap-2 text-sm">
                        <p>Couldn't load meetings</p>
                        <Button variant="outline" size="sm" onClick={retry}>
                            Retry
                        </Button>
                    </div>
                )}
                {list.kind === "loaded" && list.meetings.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        No meetings yet
                    </p>
                )}
                {list.kind === "loaded" && list.meetings.length > 0 && (
                    <ul className="flex flex-col gap-1">
                        {list.meetings.map((meeting) => (
                            <li
                                key={meeting.id}
                                className="group flex items-center gap-1 rounded-lg hover:bg-muted"
                            >
                                <Link
                                    to={`/meetings/${meeting.id}`}
                                    ref={(link) => {
                                        if (link) {
                                            meetingLinkRefs.current.set(
                                                meeting.id,
                                                link,
                                            );
                                        } else {
                                            meetingLinkRefs.current.delete(
                                                meeting.id,
                                            );
                                        }
                                    }}
                                    className="flex flex-1 items-center justify-between rounded-lg px-3 py-2"
                                >
                                    <span className="font-medium">
                                        {displayName(meeting.name)}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {formatMeetingDate(meeting.date)}
                                    </span>
                                </Link>
                                <Button
                                    ref={(button) => {
                                        if (button) {
                                            archiveButtonRefs.current.set(
                                                meeting.id,
                                                button,
                                            );
                                        } else {
                                            archiveButtonRefs.current.delete(
                                                meeting.id,
                                            );
                                        }
                                    }}
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Archive "${displayName(meeting.name)}"`}
                                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                    onClick={() => handleArchive(meeting)}
                                >
                                    <ArchiveIcon />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
