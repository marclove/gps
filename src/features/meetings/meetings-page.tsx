import { ArchiveIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "@/components/page-header";
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

/** Where keyboard focus goes once the DOM shows the effect of an archive. */
type PendingFocus = "new-note" | { archiveButtonId: number } | null;

/** The page that lists all meetings and creates new ones. */
export function MeetingsPage() {
    const navigate = useNavigate();
    const { archive, version, restored } = useArchive();
    const [list, setList] = useState<ListState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [creating, setCreating] = useState(false);
    const [createFailed, setCreateFailed] = useState(false);
    const [archiveFailed, setArchiveFailed] = useState(false);
    const newNoteButtonRef = useRef<HTMLButtonElement>(null);
    const meetingLinkRefs = useRef(new Map<number, HTMLAnchorElement>());
    const archiveButtonRefs = useRef(new Map<number, HTMLButtonElement>());
    // Where to move focus once the DOM catches up with the row an archive just
    // removed. `null` means nothing is waiting for focus.
    const pendingFocus = useRef<PendingFocus>(null);
    // The restored meeting this page has already moved focus for, so a restore that
    // happened before this page opened, or one this page already reacted to, does not
    // move focus again.
    const handledRestored = useRef<RestoredMeeting | null>(restored);

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
        if (pendingFocus.current === "new-note") {
            newNoteButtonRef.current?.focus();
            pendingFocus.current = null;
            return;
        }
        if (pendingFocus.current && list.kind === "loaded") {
            const button = archiveButtonRefs.current.get(
                pendingFocus.current.archiveButtonId,
            );
            if (button) {
                button.focus();
                pendingFocus.current = null;
            }
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
        try {
            await archive({ id: meeting.id, name: displayName(meeting.name) });
            setArchiveFailed(false);
            setList((current) => {
                if (current.kind !== "loaded") return current;
                const index = current.meetings.findIndex(
                    (candidate) => candidate.id === meeting.id,
                );
                const remaining = current.meetings.filter(
                    (candidate) => candidate.id !== meeting.id,
                );
                if (remaining.length === 0) {
                    pendingFocus.current = "new-note";
                } else {
                    const nextIndex =
                        index < remaining.length ? index : remaining.length - 1;
                    pendingFocus.current = {
                        archiveButtonId: remaining[nextIndex].id,
                    };
                }
                return { kind: "loaded", meetings: remaining };
            });
        } catch {
            setArchiveFailed(true);
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
            <div className="flex flex-col gap-4 px-4 pb-2">
                <h1 className={PAGE_TITLE_CLASSES}>Meetings</h1>
                {archiveFailed && (
                    <p role="alert" className="text-sm text-destructive">
                        Couldn't archive the meeting. Try again.
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
