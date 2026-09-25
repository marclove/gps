import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
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

type ListState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; meetings: MeetingSummary[] };

/** State that the Meetings page gives the editor page when it opens a new meeting. */
export type NewMeetingState = { isNew: true };

/** The page that lists all meetings and creates new ones. */
export function MeetingsPage() {
    const navigate = useNavigate();
    const [list, setList] = useState<ListState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [creating, setCreating] = useState(false);
    const [createFailed, setCreateFailed] = useState(false);

    useEffect(() => {
        let current = true;
        listMeetings().then(
            (meetings) => current && setList({ kind: "loaded", meetings }),
            () => current && setList({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt]);

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

    return (
        <>
            <PageHeader crumbs={[{ label: "Meetings" }]}>
                <Button onClick={createNote} disabled={creating}>
                    <PlusIcon />
                    New note
                </Button>
            </PageHeader>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                <h1 className={PAGE_TITLE_CLASSES}>Meetings</h1>
                {createFailed && (
                    <p role="alert" className="text-sm text-destructive">
                        Couldn't create a note. Try again.
                    </p>
                )}
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
                            <li key={meeting.id}>
                                <Link
                                    to={`/meetings/${meeting.id}`}
                                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted"
                                >
                                    <span className="font-medium">
                                        {displayName(meeting.name)}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {formatMeetingDate(meeting.date)}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}
