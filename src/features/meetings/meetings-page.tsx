import { ArchiveIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { PageHeader } from "@/components/page-header";
import { PAGE_TITLE_CLASSES } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { formatMeetingDate, toMeetingDate } from "@/lib/dates";
import {
    archiveMeeting,
    createMeeting,
    displayName,
    listMeetings,
    type MeetingSummary,
    unarchiveMeeting,
} from "@/lib/meetings";

type ListState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; meetings: MeetingSummary[] };

/** State that the Meetings page gives the editor page when it opens a new meeting. */
export type NewMeetingState = { isNew: true };

/** A meeting that was just archived. The Meetings page shows its name in the archive notice. */
export type ArchivedMeeting = { id: number; name: string };

/** State that the editor page gives the Meetings page when it archives a meeting. */
export type MeetingsPageState = { archived: ArchivedMeeting };

/** The page that lists all meetings and creates new ones. */
export function MeetingsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [list, setList] = useState<ListState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [creating, setCreating] = useState(false);
    const [createFailed, setCreateFailed] = useState(false);
    const [archivedMeeting, setArchivedMeeting] =
        useState<ArchivedMeeting | null>(
            (location.state as MeetingsPageState | null)?.archived ?? null,
        );
    const [archiveFailed, setArchiveFailed] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [restoreFailed, setRestoreFailed] = useState(false);
    // Counts how many times the archive notice has changed. `restore` reads this when it
    // starts and compares it again when the restore finishes, so a restore for a meeting
    // whose notice a later archive has already replaced does not touch that later notice.
    const noticeGeneration = useRef(0);
    // Tracks the meeting the archive notice currently names, so a list result that was
    // already in flight when that meeting was archived does not bring it back.
    const archivedMeetingRef = useRef(archivedMeeting);
    useEffect(() => {
        archivedMeetingRef.current = archivedMeeting;
    }, [archivedMeeting]);
    const undoButtonRef = useRef<HTMLButtonElement>(null);
    const meetingLinkRefs = useRef(new Map<number, HTMLAnchorElement>());
    // What to move focus to once the DOM catches up: the Undo button right after it
    // appears, or the link of a meeting that a restore just brought back once the
    // reloaded list shows it. `null` means nothing is waiting for focus.
    const pendingFocus = useRef<"undo" | { restoredId: number } | null>(
        archivedMeeting ? "undo" : null,
    );

    useEffect(() => {
        let current = true;
        listMeetings().then(
            (meetings) =>
                current &&
                setList({
                    kind: "loaded",
                    meetings: archivedMeetingRef.current
                        ? meetings.filter(
                              (meeting) =>
                                  meeting.id !== archivedMeetingRef.current?.id,
                          )
                        : meetings,
                }),
            () => current && setList({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt]);

    useEffect(() => {
        if (pendingFocus.current === "undo") {
            undoButtonRef.current?.focus();
            pendingFocus.current = null;
            return;
        }
        if (pendingFocus.current && list.kind === "loaded") {
            const link = meetingLinkRefs.current.get(
                pendingFocus.current.restoredId,
            );
            if (link) {
                link.focus();
                pendingFocus.current = null;
            }
        }
    }, [list]);

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

    async function archive(meeting: MeetingSummary) {
        try {
            await archiveMeeting(meeting.id);
            setList((current) =>
                current.kind === "loaded"
                    ? {
                          kind: "loaded",
                          meetings: current.meetings.filter(
                              (candidate) => candidate.id !== meeting.id,
                          ),
                      }
                    : current,
            );
            noticeGeneration.current += 1;
            setArchivedMeeting({
                id: meeting.id,
                name: displayName(meeting.name),
            });
            setArchiveFailed(false);
            setRestoreFailed(false);
            pendingFocus.current = "undo";
        } catch {
            setArchiveFailed(true);
        }
    }

    async function restore(meeting: ArchivedMeeting) {
        const generation = noticeGeneration.current;
        setRestoring(true);
        try {
            await unarchiveMeeting(meeting.id);
            // Reload the list so the restored meeting reappears, even if a later archive
            // has already replaced the notice. Only touch the notice itself if it still
            // names this meeting.
            setAttempt((value) => value + 1);
            if (noticeGeneration.current === generation) {
                noticeGeneration.current += 1;
                setArchivedMeeting(null);
                setArchiveFailed(false);
                setRestoreFailed(false);
                pendingFocus.current = { restoredId: meeting.id };
            }
        } catch {
            if (noticeGeneration.current === generation) {
                setRestoreFailed(true);
            }
        } finally {
            setRestoring(false);
        }
    }

    return (
        // The header and the title stay in place, and the last row, which gets the
        // remaining height, scrolls.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)]">
            <PageHeader crumbs={[{ label: "Meetings" }]}>
                <Button onClick={createNote} disabled={creating}>
                    <PlusIcon />
                    New note
                </Button>
            </PageHeader>
            <div className="flex flex-col gap-4 px-4 pb-2">
                <h1 className={PAGE_TITLE_CLASSES}>Meetings</h1>
                {/* Always mounted, so a screen reader announces a notice that appears
                    together with this container rather than missing it. */}
                <div role="status" className="flex items-center gap-2 text-sm">
                    {archivedMeeting && (
                        <>
                            <p>Archived "{archivedMeeting.name}".</p>
                            <Button
                                ref={undoButtonRef}
                                variant="outline"
                                size="sm"
                                disabled={restoring}
                                onClick={() => restore(archivedMeeting)}
                            >
                                Undo
                            </Button>
                        </>
                    )}
                </div>
                {archiveFailed && (
                    <p role="alert" className="text-sm text-destructive">
                        Couldn't archive the meeting. Try again.
                    </p>
                )}
                {restoreFailed && (
                    <p role="alert" className="text-sm text-destructive">
                        Couldn't restore the meeting. Try again.
                    </p>
                )}
                {createFailed && (
                    <p role="alert" className="text-sm text-destructive">
                        Couldn't create a note. Try again.
                    </p>
                )}
            </div>
            {/* `pt-2` leaves room for the focus ring of the first meeting, which the
                scrolling area would cut off. The title row has 8 pixels less padding,
                so the list stays at the same position. */}
            <div className="overflow-y-auto px-4 pt-2 pb-4">
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
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Archive "${displayName(meeting.name)}"`}
                                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                    onClick={() => archive(meeting)}
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
