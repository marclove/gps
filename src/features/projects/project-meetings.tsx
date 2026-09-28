import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { useDelete } from "@/components/use-delete";
import { Button } from "@/components/ui/button";
import { formatMeetingDate } from "@/lib/dates";
import { displayName, listMeetings, type MeetingSummary } from "@/lib/meetings";

type ListState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; meetings: MeetingSummary[] };

/**
 * The list of the meetings about a project, in the sidebar of the project page. It shows the
 * meetings that are not deleted, with the newest date first, as the Meetings page does. Each
 * row is a link to the editor page of the meeting and shows the name and the date. The list
 * loads again after each delete and restore.
 *
 * When `projectId` is `null`, the project is a draft, and the list is empty.
 */
export function ProjectMeetings({ projectId }: { projectId: number | null }) {
    const [list, setList] = useState<ListState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const { version } = useDelete();
    const headingId = useId();

    useEffect(() => {
        if (projectId === null) return;
        let current = true;
        listMeetings().then(
            (meetings) =>
                current &&
                setList({
                    kind: "loaded",
                    // The backend gives the newest date first. The sort keeps that order
                    // and the order of meetings on the same date.
                    meetings: meetings
                        .filter((meeting) => meeting.projectId === projectId)
                        .sort((a, b) => b.date.localeCompare(a.date)),
                }),
            () => current && setList({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [projectId, attempt, version]);

    // A draft project has no meetings, so its list does not load.
    const shown: ListState =
        projectId === null ? { kind: "loaded", meetings: [] } : list;

    return (
        // The heading stays in place, and the rows scroll.
        <section
            aria-labelledby={headingId}
            className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]"
        >
            <h2 id={headingId} className="px-6 pb-2 text-sm font-medium">
                Meetings
            </h2>
            {/* `pt-1` leaves room for the focus ring of the first row, which the scrolling
                area would cut off. */}
            <div className="min-h-0 overflow-y-auto px-6 pt-1 pb-4 text-sm">
                {shown.kind === "loading" && (
                    <p className="text-muted-foreground">Loading…</p>
                )}
                {shown.kind === "error" && (
                    <div className="flex items-center gap-2">
                        <p>Couldn't load meetings</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setList({ kind: "loading" });
                                setAttempt((value) => value + 1);
                            }}
                        >
                            Retry
                        </Button>
                    </div>
                )}
                {shown.kind === "loaded" && shown.meetings.length === 0 && (
                    <p className="text-muted-foreground">No meetings</p>
                )}
                {shown.kind === "loaded" && shown.meetings.length > 0 && (
                    <ul className="flex flex-col gap-1">
                        {shown.meetings.map((meeting) => (
                            <li key={meeting.id}>
                                <Link
                                    to={`/meetings/${meeting.id}`}
                                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-muted"
                                >
                                    <span className="min-w-0 truncate font-medium">
                                        {displayName(meeting.name)}
                                    </span>
                                    <span className="shrink-0 text-muted-foreground">
                                        {formatMeetingDate(meeting.date)}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
