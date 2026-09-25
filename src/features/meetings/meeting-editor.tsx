import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { PAGE_TITLE_CLASSES } from "@/components/page-title";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    displayName,
    updateMeeting,
    type Meeting,
    type MeetingChanges,
} from "@/lib/meetings";
import { NotesEditor } from "./notes-editor";
import { SaveStatus } from "./save-status";
import { useAutosave } from "./use-autosave";

/** Matches a complete calendar date in the `YYYY-MM-DD` format that the backend accepts. */
const COMPLETE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The editor for one meeting: its name, its date, and its notes. Changes are saved
 * automatically. If `isNew` is true, the name field gets the focus and its text is
 * selected.
 */
export function MeetingEditor({
    meeting,
    isNew,
}: {
    meeting: Meeting;
    isNew: boolean;
}) {
    const [draft, setDraft] = useState<MeetingChanges>({
        name: meeting.name,
        date: meeting.date,
        notes: meeting.notes,
    });
    const save = useCallback(
        (changes: MeetingChanges) => updateMeeting(meeting.id, changes),
        [meeting.id],
    );
    const { status, retry } = useAutosave(draft, save);
    const nameInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isNew) return;
        // `select()` alone does not move the focus to the field.
        nameInput.current?.focus();
        nameInput.current?.select();
    }, [isNew]);

    const changeNotes = useCallback(
        (notes: string) => setDraft((current) => ({ ...current, notes })),
        [],
    );

    return (
        // The header and the name and date row stay in place. The notes editor gets
        // the remaining height and scrolls its notes itself.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)]">
            <PageHeader
                crumbs={[
                    { label: "Meetings", to: "/meetings" },
                    { label: displayName(draft.name) },
                ]}
            >
                <SaveStatus status={status} onRetry={retry} />
            </PageHeader>
            <div className="flex items-center gap-2 px-8 pb-4">
                <Input
                    ref={nameInput}
                    aria-label="Meeting name"
                    value={draft.name}
                    placeholder={displayName("")}
                    onChange={(event) => {
                        const name = event.target.value;
                        setDraft((current) => ({ ...current, name }));
                    }}
                    className={cn(
                        PAGE_TITLE_CLASSES,
                        "h-auto border-none px-0 shadow-none focus-visible:ring-0",
                    )}
                />
                <Input
                    type="date"
                    aria-label="Meeting date"
                    value={draft.date}
                    required
                    onChange={(event) => {
                        const date = event.target.value;
                        // An incomplete or out of range value keeps the last complete
                        // date, because the backend accepts only `YYYY-MM-DD`.
                        if (!COMPLETE_DATE.test(date)) return;
                        setDraft((current) => ({ ...current, date }));
                    }}
                    // The base Input has `min-w-0`, so without `shrink-0` the name
                    // field, which fills the row, squeezes this field and cuts off the year.
                    className="w-auto shrink-0"
                />
            </div>
            <NotesEditor
                initialMarkdown={meeting.notes}
                onChange={changeNotes}
            />
        </div>
    );
}
