import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
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
        <>
            <PageHeader
                crumbs={[
                    { label: "Meetings", to: "/meetings" },
                    { label: displayName(draft.name) },
                ]}
            >
                <SaveStatus status={status} onRetry={retry} />
            </PageHeader>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                <div className="flex items-center gap-2">
                    <Input
                        ref={nameInput}
                        aria-label="Meeting name"
                        value={draft.name}
                        placeholder={displayName("")}
                        onChange={(event) => {
                            const name = event.target.value;
                            setDraft((current) => ({ ...current, name }));
                        }}
                        // The base Input sets `md:text-sm`, which would override a plain
                        // `text-4xl` in wide windows. The name must stay larger than the
                        // largest heading in the notes (an H1 is 30px).
                        className="h-auto border-none px-0 text-4xl font-semibold shadow-none focus-visible:ring-0 md:text-4xl"
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
        </>
    );
}
