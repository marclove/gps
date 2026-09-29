import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { listInitiatives } from "@/lib/initiatives";
import { getMeeting, listMeetings } from "@/lib/meetings";
import { listProjects } from "@/lib/projects";
import { getTask, taskTitle, type Task } from "@/lib/tasks";
import {
    FIELD_LABEL_CLASSES,
    NAME_FIELD_CLASSES,
} from "@/components/form-field-classes";
import { TaskForm, type TaskChoices, type TaskMeeting } from "./task-form";

/** What the sheet shows: the identifier of a task, or "new" for a draft. */
export type TaskSheetTarget = number | "new";

type ChoicesLoad =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; choices: TaskChoices };

type TaskLoad =
    | { kind: "loading" }
    | { kind: "error" }
    // `task` is `null` for a draft.
    | { kind: "loaded"; task: Task | null; meeting: TaskMeeting | null };

/**
 * The sheet that edits one task. It opens from the right side of the window.
 *
 * - `id` is the identifier of the task, "new" for a draft, or `null` when the sheet is
 *   closed. A draft is a new task that is not saved yet. For a draft, the title field gets
 *   the focus.
 * - `title` is the title of the task. The sheet uses its shown title as its name.
 * - `onClose` is called when the user closes the sheet, also with the "Save" button and with
 *   the link to the meeting.
 * - `onLoaded` receives the task each time the sheet loads it.
 * - `onSaved` receives the task after each save that succeeds, also after the create of a
 *   draft.
 * - `onCreated` receives the task that a draft created. The caller then gives its
 *   identifier as `id`, and the sheet goes on editing the task in the same form.
 * - `onDelete` is called when the user clicks "Delete", after the changes that were waiting
 *   are saved. It receives the title that the backend has for the task.
 * - `finalFocus` receives the focus when the sheet closes. If it is not given, the focus
 *   goes back to the element that opened the sheet.
 */
export function TaskSheet({
    id,
    title,
    onClose,
    onLoaded,
    onSaved,
    onCreated,
    onDelete,
    finalFocus,
}: {
    id: TaskSheetTarget | null;
    title: string;
    onClose: () => void;
    onLoaded: (task: Task) => void;
    onSaved: (task: Task) => void;
    onCreated: (task: Task) => void;
    onDelete: (savedTitle: string) => Promise<void>;
    finalFocus?: RefObject<HTMLElement | null>;
}) {
    // While the sheet closes, it keeps the last task that it showed.
    const [shown, setShown] = useState({ id, title });
    if (id !== null && (id !== shown.id || title !== shown.title)) {
        setShown({ id, title });
    }
    // Each draft gets a new form. The task that a draft created stays in the form of the
    // draft, so that the form is not loaded again. `id` changes from "new" directly to a
    // number only when the draft was created: to open another task, the sheet must close
    // first, and then `id` is `null` in between.
    const [draft, setDraft] = useState<{
        count: number;
        createdId: number | null;
    }>({ count: 0, createdId: null });
    const [previousId, setPreviousId] = useState(id);
    if (id !== previousId) {
        setPreviousId(id);
        if (id === "new") {
            setDraft((current) => ({
                count: current.count + 1,
                createdId: null,
            }));
        } else if (id !== null) {
            setDraft((current) => ({
                ...current,
                createdId: previousId === "new" ? id : null,
            }));
        }
    }
    const inDraftForm =
        shown.id === "new" ||
        (shown.id !== null && shown.id === draft.createdId);
    const bodyKey = inDraftForm ? `draft-${draft.count}` : `id-${shown.id}`;
    const titleInput = useRef<HTMLInputElement>(null);

    return (
        <Sheet
            open={id !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent
                side="right"
                initialFocus={id === "new" ? titleInput : true}
                finalFocus={finalFocus ?? true}
                className="gap-0 data-[side=right]:w-[min(40rem,100vw)] data-[side=right]:sm:max-w-none"
            >
                <SheetTitle className="sr-only">
                    {taskTitle({ title: shown.title })}
                </SheetTitle>
                {shown.id !== null && (
                    <SheetBody
                        key={bodyKey}
                        id={shown.id}
                        titleRef={titleInput}
                        onLoaded={onLoaded}
                        onSaved={onSaved}
                        onCreated={onCreated}
                        onDelete={onDelete}
                        onClose={onClose}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
}

/** Loads the meeting that a task came from. A meeting that `list_meetings` leaves out is deleted. */
async function loadMeeting(meetingId: number): Promise<TaskMeeting> {
    const [meeting, meetings] = await Promise.all([
        getMeeting(meetingId),
        listMeetings(),
    ]);
    if (!meeting) throw new Error(`Meeting ${String(meetingId)} not found`);
    return {
        id: meeting.id,
        name: meeting.name,
        deleted: !meetings.some((m) => m.id === meetingId),
    };
}

/** Loads the task and the meeting that it came from. Rejects if the task does not exist. */
async function loadTask(
    id: number,
): Promise<{ task: Task; meeting: TaskMeeting | null }> {
    const task = await getTask(id);
    if (!task) throw new Error(`Task ${String(id)} not found`);
    const meeting =
        task.meetingId === null ? null : await loadMeeting(task.meetingId);
    return { task, meeting };
}

/** Loads the projects and the initiatives that the select boxes offer, also deleted ones. */
async function loadChoices(): Promise<TaskChoices> {
    const [projects, initiatives] = await Promise.all([
        listProjects({ includeDeleted: true }),
        listInitiatives({ includeDeleted: true }),
    ]);
    return { projects, initiatives };
}

/**
 * Loads the task and shows its form, or the fields disabled while it loads. For a draft, it
 * shows the form at once. When the draft is created, `id` changes to the identifier of the
 * new task, and the form stays. The projects and the initiatives load together with the
 * task.
 */
function SheetBody({
    id,
    titleRef,
    onLoaded,
    onSaved,
    onCreated,
    onDelete,
    onClose,
}: {
    id: TaskSheetTarget;
    titleRef: RefObject<HTMLInputElement | null>;
    onLoaded: (task: Task) => void;
    onSaved: (task: Task) => void;
    onCreated: (task: Task) => void;
    onDelete: (savedTitle: string) => Promise<void>;
    onClose: () => void;
}) {
    // The task that the body loads, or `null` for a body that starts as a draft. Such a body
    // never loads the task, because its form has the saved values.
    const [loadId] = useState(id === "new" ? null : id);
    const [taskLoad, setTaskLoad] = useState<TaskLoad>(
        loadId === null
            ? { kind: "loaded", task: null, meeting: null }
            : { kind: "loading" },
    );
    const [choicesLoad, setChoicesLoad] = useState<ChoicesLoad>({
        kind: "loading",
    });
    const [attempt, setAttempt] = useState(0);
    const onLoadedRef = useRef(onLoaded);
    useEffect(() => {
        onLoadedRef.current = onLoaded;
    }, [onLoaded]);

    useEffect(() => {
        let current = true;
        loadChoices().then(
            (choices) => current && setChoicesLoad({ kind: "loaded", choices }),
            () => current && setChoicesLoad({ kind: "error" }),
        );
        if (loadId !== null) {
            loadTask(loadId).then(
                ({ task, meeting }) => {
                    if (!current) return;
                    setTaskLoad({ kind: "loaded", task, meeting });
                    onLoadedRef.current(task);
                },
                () => current && setTaskLoad({ kind: "error" }),
            );
        }
        return () => {
            current = false;
        };
    }, [loadId, attempt]);

    if (taskLoad.kind === "error" || choicesLoad.kind === "error") {
        return (
            <div className="flex items-start gap-2 py-4 pr-14 pl-6 text-sm">
                <p>Couldn't load the task</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        if (loadId !== null) setTaskLoad({ kind: "loading" });
                        setChoicesLoad({ kind: "loading" });
                        setAttempt((value) => value + 1);
                    }}
                >
                    Retry
                </Button>
            </div>
        );
    }
    if (taskLoad.kind === "loaded") {
        return (
            <TaskForm
                task={taskLoad.task}
                choices={
                    choicesLoad.kind === "loaded" ? choicesLoad.choices : null
                }
                meeting={taskLoad.meeting}
                onSaved={onSaved}
                onCreated={onCreated}
                onDelete={onDelete}
                onClose={onClose}
                titleRef={titleRef}
            />
        );
    }
    return (
        // The same labels and fields as the form, so nothing moves when it loads.
        <div className="grid justify-items-start gap-4 py-4 pr-14 pl-6">
            <div className="grid gap-1.5 justify-self-stretch">
                <span className={FIELD_LABEL_CLASSES}>Title</span>
                <Input
                    aria-label="Task title"
                    disabled
                    className={NAME_FIELD_CLASSES}
                />
            </div>
            <div className="flex items-start gap-4">
                <div className="grid gap-1.5">
                    <span className={FIELD_LABEL_CLASSES}>Project</span>
                    <NativeSelect aria-label="Project" disabled>
                        <NativeSelectOption value="" />
                    </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                    <span className={FIELD_LABEL_CLASSES}>Initiative</span>
                    <NativeSelect aria-label="Initiative" disabled>
                        <NativeSelectOption value="" />
                    </NativeSelect>
                </div>
            </div>
        </div>
    );
}
