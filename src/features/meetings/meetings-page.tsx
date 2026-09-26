import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArchivableList } from "@/components/archivable-list";
import { PageHeader } from "@/components/page-header";
import { PAGE_TITLE_CLASSES } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { formatMeetingDate, toMeetingDate } from "@/lib/dates";
import { createMeeting, displayName, listMeetings } from "@/lib/meetings";

/** State that the Meetings page gives the editor page when it opens a new meeting. */
export type NewMeetingState = { isNew: true };

/**
 * State that the editor page gives the Meetings page after it archives a meeting. The
 * Meetings page then moves focus to the "New note" button, because the button that the
 * user clicked is gone.
 */
export type MeetingsPageState = { focusNewNote: true };

/** The page that lists all meetings and creates new ones. */
export function MeetingsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const focusNewNote =
        (location.state as MeetingsPageState | null)?.focusNewNote === true;
    const [creating, setCreating] = useState(false);
    const [createFailed, setCreateFailed] = useState(false);
    const newNoteButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (focusNewNote) newNoteButtonRef.current?.focus();
    }, [focusNewNote]);

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
            <ArchivableList
                kind="meeting"
                load={listMeetings}
                itemPath={(meeting) => `/meetings/${meeting.id}`}
                displayName={displayName}
                detail={(meeting) => formatMeetingDate(meeting.date)}
                emptyText="No meetings yet"
                loadErrorText="Couldn't load meetings"
                archiveFailureMessage="Couldn't archive the meeting. Try again."
                fallbackFocusRef={newNoteButtonRef}
            />
        </div>
    );
}
