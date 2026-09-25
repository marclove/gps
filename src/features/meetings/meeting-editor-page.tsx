import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getMeeting, type Meeting } from "@/lib/meetings";
import { MeetingEditor } from "./meeting-editor";
import type { NewMeetingState } from "./meetings-page";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "not-found" }
    | { kind: "loaded"; meeting: Meeting };

/** The page that loads one meeting, by the identifier in the route, and shows its editor. */
export function MeetingEditorPage() {
    const { id } = useParams();
    const location = useLocation();
    const isNew = (location.state as NewMeetingState | null)?.isNew === true;

    // The key gives each meeting a new loader and editor, so that the editor of one
    // meeting saves its changes before the editor of the next meeting opens.
    return <MeetingLoader key={id} id={Number(id)} isNew={isNew} />;
}

function MeetingLoader({ id, isNew }: { id: number; isNew: boolean }) {
    const [load, setLoad] = useState<LoadState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let current = true;
        getMeeting(id).then(
            (meeting) => {
                if (!current) return;
                setLoad(
                    meeting
                        ? { kind: "loaded", meeting }
                        : { kind: "not-found" },
                );
            },
            () => current && setLoad({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [id, attempt]);

    if (load.kind === "loaded") {
        return <MeetingEditor meeting={load.meeting} isNew={isNew} />;
    }

    return (
        <>
            <PageHeader crumbs={[{ label: "Meetings", to: "/meetings" }]} />
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0 text-sm">
                {load.kind === "loading" && (
                    <p className="text-muted-foreground">Loading…</p>
                )}
                {load.kind === "not-found" && (
                    <p>
                        This meeting doesn't exist.{" "}
                        <Link to="/meetings" className="underline">
                            Back to Meetings
                        </Link>
                    </p>
                )}
                {load.kind === "error" && (
                    <div className="flex items-center gap-2">
                        <p>Couldn't load this meeting</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setLoad({ kind: "loading" });
                                setAttempt((value) => value + 1);
                            }}
                        >
                            Retry
                        </Button>
                    </div>
                )}
            </div>
        </>
    );
}
