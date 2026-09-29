import { Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import { PageHeader } from "@/components/page-header";
import { SaveStatus } from "@/components/save-status";
import { useFailureToast } from "@/components/use-failure-toast";
import { PAGE_TITLE_CLASSES } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAutosave } from "@/hooks/use-autosave";
import { cn } from "@/lib/utils";
import {
    displayName,
    updateMeeting,
    type Meeting,
    type MeetingChanges,
} from "@/lib/meetings";
import {
    ActionItemsPanel,
    type ActionItemsPanelHandle,
} from "@/features/tasks/action-items-panel";
import { useTaskSheet } from "@/features/work/use-task-sheet";
import type { Task } from "@/lib/tasks";
import { MeetingDetailsSidebar } from "./meeting-details-sidebar";
import type { MeetingsPageState } from "./meetings-page";
import { useDelete } from "@/components/use-delete";
import { MeetingInitiativesPicker } from "./meeting-initiatives-picker";
import { MeetingProjectSelect } from "./meeting-project-select";

/** Matches a complete calendar date in the `YYYY-MM-DD` format that the backend accepts. */
const COMPLETE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The editor for one meeting: its name and its notes at the left, and a sidebar with
 * its date, its project, its initiatives, the Delete button, and its action items at the right.
 * The Open button of an action item opens the task sheet over the editor.
 * Changes are saved automatically. If `isNew` is true, the name field gets the focus
 * and its text is selected.
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
    // The project and the initiatives of the meeting, as the backend stored them last. A new
    // project clears the initiatives, so the initiatives row starts again after a project change.
    const [assignment, setAssignment] = useState({
        projectId: meeting.projectId,
        initiativeIds: meeting.initiativeIds,
    });
    const save = useCallback(
        (changes: MeetingChanges) => updateMeeting(meeting.id, changes),
        [meeting.id],
    );
    const { status, retry } = useAutosave(draft, save);
    const nameInput = useRef<HTMLInputElement>(null);
    const dateId = useId();
    const navigate = useNavigate();
    const { deleteItem: deleteInProvider } = useDelete();
    const [deleting, setDeleting] = useState(false);
    const failureToast = useFailureToast();
    // The task that the task sheet saved last, which the action items panel shows.
    const [savedTask, setSavedTask] = useState<Task>();
    const actionItems = useRef<ActionItemsPanelHandle>(null);
    // The element that gets the focus after a task is deleted in the task sheet, because
    // the Open button that opened the sheet is gone.
    const focusAfterDelete = useRef<HTMLElement | null>(null);
    const taskSheet = useTaskSheet({
        onSaved: setSavedTask,
        onDeleted: (id) => {
            focusAfterDelete.current = actionItems.current?.deleted(id) ?? null;
        },
        focusAfterDelete,
    });

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

    async function handleDelete() {
        setDeleting(true);
        try {
            await deleteInProvider({
                kind: "meeting",
                id: meeting.id,
                name: draft.name,
            });
            failureToast.clear();
            const state: MeetingsPageState = { focusNewNote: true };
            navigate("/meetings", { state });
        } catch {
            failureToast.show("Couldn't delete the meeting. Try again.");
            setDeleting(false);
        }
    }

    return (
        // The notes are at the left, and the meeting details sidebar is at the right, as
        // tall as the main area. In the left column, the header and the name row stay in
        // place, and the notes editor gets the remaining height and scrolls its notes itself.
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(18rem,calc(11rem_+_11vw),24rem)] grid-rows-[minmax(0,1fr)]">
            <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]">
                <PageHeader
                    crumbs={[
                        { label: "Meetings", to: "/meetings" },
                        { label: displayName(draft.name) },
                    ]}
                >
                    <SaveStatus status={status} onRetry={retry} />
                </PageHeader>
                <div className="px-6 pb-4">
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
                </div>
                <MarkdownEditor
                    initialMarkdown={meeting.notes}
                    onChange={changeNotes}
                    label="Notes"
                />
            </div>
            <MeetingDetailsSidebar
                properties={
                    <>
                        <div className="flex items-center justify-between gap-2">
                            <label
                                htmlFor={dateId}
                                className="text-sm font-medium"
                            >
                                Date
                            </label>
                            <Input
                                id={dateId}
                                type="date"
                                aria-label="Meeting date"
                                value={draft.date}
                                required
                                onChange={(event) => {
                                    const date = event.target.value;
                                    // An incomplete or out of range value keeps the last
                                    // complete date, because the backend accepts only
                                    // `YYYY-MM-DD`.
                                    if (!COMPLETE_DATE.test(date)) return;
                                    setDraft((current) => ({
                                        ...current,
                                        date,
                                    }));
                                }}
                                // The base Input has `min-w-0`, so without `shrink-0` the
                                // label squeezes this field and cuts off the year.
                                className="w-auto shrink-0"
                            />
                        </div>
                        <MeetingProjectSelect
                            meetingId={meeting.id}
                            projectId={assignment.projectId}
                            onSaved={(saved) =>
                                setAssignment({
                                    projectId: saved.projectId,
                                    initiativeIds: saved.initiativeIds,
                                })
                            }
                        />
                        <MeetingInitiativesPicker
                            key={assignment.projectId ?? "none"}
                            meetingId={meeting.id}
                            projectId={assignment.projectId}
                            initiativeIds={assignment.initiativeIds}
                        />
                    </>
                }
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={deleting}
                        onClick={handleDelete}
                    >
                        <Trash2Icon />
                        Delete
                    </Button>
                }
                lists={
                    <ActionItemsPanel
                        ref={actionItems}
                        meetingId={meeting.id}
                        onOpen={taskSheet.openTask}
                        savedTask={savedTask}
                    />
                }
            />
            {taskSheet.sheet}
        </div>
    );
}
