import { useEffect, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatMeetingDate } from "@/lib/dates";
import { displayName, listMeetings, type MeetingSummary } from "@/lib/meetings";

type ListState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; meetings: MeetingSummary[] };

/** The page that lists all meetings. */
export function MeetingsPage() {
    const [list, setList] = useState<ListState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);

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

    return (
        <>
            <PageHeader crumbs={[{ label: "Meetings" }]} />
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
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
