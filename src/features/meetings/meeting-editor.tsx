import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import {
    displayName,
    updateMeeting,
    type Meeting,
    type MeetingChanges,
} from "@/lib/meetings";
import { SaveStatus } from "./save-status";
import { useAutosave } from "./use-autosave";

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
                        className="h-auto border-none px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
                    />
                    <Input
                        type="date"
                        aria-label="Meeting date"
                        value={draft.date}
                        required
                        onChange={(event) => {
                            const date = event.target.value;
                            // An empty value means the date is incomplete. Keep the last
                            // complete date, because the backend accepts only real dates.
                            if (date === "") return;
                            setDraft((current) => ({ ...current, date }));
                        }}
                        className="w-auto"
                    />
                </div>
            </div>
        </>
    );
}
