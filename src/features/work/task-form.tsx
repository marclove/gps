import { Trash2Icon } from "lucide-react";
import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type Ref,
} from "react";
import { Link } from "react-router";
import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import { SaveStatus } from "@/components/save-status";
import { useFailureToast } from "@/components/use-failure-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAutosave } from "@/hooks/use-autosave";
import type { InitiativeSummary } from "@/lib/initiatives";
import { displayName as meetingDisplayName } from "@/lib/meetings";
import type { Project } from "@/lib/projects";
import {
    createTask,
    setTaskInitiative,
    setTaskProject,
    taskTitle,
    updateTaskDescription,
    updateTaskTitle,
    type Task,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";
import {
    FIELD_LABEL_CLASSES,
    NAME_FIELD_CLASSES,
} from "@/features/initiatives/initiative-form";
import { TaskInitiativeField } from "./task-initiative-field";
import { TaskProjectField } from "./task-project-field";

/** The projects and the initiatives that the select boxes of a task offer, also deleted ones. */
export type TaskChoices = {
    projects: Project[];
    initiatives: InitiativeSummary[];
};

/** The meeting that a task came from, as the task sheet shows it. */
export type TaskMeeting = {
    id: number;
    name: string;
    /** True when the meeting is deleted. Then the sheet shows its name as plain text. */
    deleted: boolean;
};

/** The fields of a task that the form saves automatically. */
type Fields = { title: string; description: string };

/** The project and the initiative of a task. */
type Selection = { projectId: number | null; initiativeId: number | null };

/**
 * Returns true if a draft with these fields is not a real change: the title is empty after
 * removing the spaces at its start and end, and the description is empty.
 */
function isEmptyDraft(fields: Fields): boolean {
    return fields.title.trim() === "" && fields.description === "";
}

/** Returns the date of completion as text, such as "September 26, 2026", in local time. */
function completionDate(completedAt: string): string {
    return new Date(completedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

/**
 * The fields of one task: its title with the save status, its project, its initiative, the
 * meeting that it came from, the date of completion if it is completed, its description, a
 * "Delete" button, and a "Save" button. "Save" only calls `onClose`. The form saves the
 * changes that are waiting when it unmounts.
 *
 * The title and the description are saved automatically after a pause. A choice of a project
 * or an initiative is saved at once, and the select boxes then show the project and the
 * initiative that the backend answers. If a choice cannot be saved, the select boxes go back
 * to the saved choice, and a failure toast says so. `choices` is `null` while the projects
 * and the initiatives load, and then the select boxes are disabled.
 *
 * When `task` is `null`, the form edits a draft: a task with an empty title, an empty
 * description, no project, and no initiative, which is not saved yet. The draft has no
 * "Delete" button and no save status, but a failed save shows "Couldn't save". The form
 * creates the task at the first real change: a title that is not empty after removing the
 * spaces at its start and end, any text in the description, or a project. After that, it
 * saves later changes as for any other task.
 *
 * `onSaved` receives the task after each save that succeeds, also after the create, and also
 * when the save finishes after the form unmounts. `onCreated` receives the task once, after
 * the create, also when the create finishes after the form unmounts. When the user clicks
 * "Delete", the form first saves the changes that are waiting, and then calls `onDelete`
 * with the title that the backend has. If a change cannot be saved, the form does not call
 * `onDelete` and shows the failure toast "Couldn't delete the task. Try again." The link to
 * the meeting calls `onClose` and opens the editor page of the meeting. The form must be in
 * a router and in a `FailureToastProvider`. `titleRef` receives the title field.
 */
export function TaskForm({
    task,
    choices,
    meeting,
    onSaved,
    onCreated,
    onDelete,
    onClose,
    titleRef,
}: {
    task: Task | null;
    choices: TaskChoices | null;
    meeting: TaskMeeting | null;
    onSaved: (task: Task) => void;
    onCreated?: (task: Task) => void;
    onDelete: (savedTitle: string) => Promise<void>;
    onClose: () => void;
    titleRef?: Ref<HTMLInputElement>;
}) {
    const [fields, setFields] = useState<Fields>({
        title: task?.title ?? "",
        description: task?.description ?? "",
    });
    const [selection, setSelection] = useState<Selection>({
        projectId: task?.projectId ?? null,
        initiativeId: task?.initiativeId ?? null,
    });
    const [deleting, setDeleting] = useState(false);
    // The identifier of the task, or `null` while the draft is not saved. The ref gives the
    // identifier to a save that finishes after the form unmounts.
    const [id, setId] = useState(task?.id ?? null);
    const idRef = useRef(task?.id ?? null);
    // The create of the draft while it runs. Saves that start meanwhile wait for it, so that
    // the draft is created only once.
    const creating = useRef<Promise<Task> | null>(null);
    // The values that the backend has now. They are refs, so that a save that finishes after
    // the form unmounts still compares with the correct values.
    const saved = useRef<Fields>({ ...fields });
    const savedSelection = useRef<Selection>({ ...selection });
    // The title that the backend has. The backend trims titles.
    const savedTitle = useRef(task?.title ?? "");
    // The latest fields, for a create that a choice starts.
    const latestFields = useRef(fields);
    // The number of the latest choice of a project or an initiative.
    const latestChoice = useRef(0);
    const mounted = useRef(true);
    const onSavedRef = useRef(onSaved);
    const onCreatedRef = useRef(onCreated);
    const titleId = useId();
    const failureToast = useFailureToast();

    useEffect(() => {
        onSavedRef.current = onSaved;
        onCreatedRef.current = onCreated;
    }, [onSaved, onCreated]);

    useEffect(() => {
        latestFields.current = fields;
    }, [fields]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Records the task that the backend answers, and gives it to the page.
    const record = useCallback((answer: Task) => {
        savedTitle.current = answer.title;
        savedSelection.current = {
            projectId: answer.projectId,
            initiativeId: answer.initiativeId,
        };
        onSavedRef.current(answer);
    }, []);

    // Creates the task from the draft with these values.
    const create = useCallback(
        (values: Fields & Selection): Promise<Task> => {
            const request = createTask({
                ...values,
                title: values.title.trim(),
            }).then(
                (created) => {
                    idRef.current = created.id;
                    saved.current = {
                        title: values.title,
                        description: values.description,
                    };
                    record(created);
                    onCreatedRef.current?.(created);
                    if (mounted.current) setId(created.id);
                    return created;
                },
                (error: unknown) => {
                    creating.current = null;
                    throw error;
                },
            );
            creating.current = request;
            return request;
        },
        [record],
    );

    // Returns the identifier of the task after a create that runs now, or `null` for a draft.
    const savedId = useCallback(async (): Promise<number | null> => {
        if (idRef.current === null && creating.current !== null) {
            await creating.current;
        }
        return idRef.current;
    }, []);

    const save = useCallback(
        async (next: Fields) => {
            const taskId = await savedId();
            if (taskId === null) {
                if (!isEmptyDraft(next)) {
                    await create({ ...next, ...savedSelection.current });
                }
                return;
            }
            if (next.title !== saved.current.title) {
                // A title is saved without the spaces at its start and end.
                const answer = await updateTaskTitle(taskId, next.title.trim());
                saved.current.title = next.title;
                record(answer);
            }
            if (next.description !== saved.current.description) {
                const answer = await updateTaskDescription(
                    taskId,
                    next.description,
                );
                saved.current.description = next.description;
                record(answer);
            }
        },
        [create, record, savedId],
    );
    const { status, retry, flush } = useAutosave(fields, save);

    /**
     * Shows `shown` at once and saves the choice with `request`. The select boxes then show
     * what the backend answers. If the save fails, they go back to the saved choice, and a
     * failure toast shows `failure`.
     */
    async function choose(
        shown: Selection,
        request: (taskId: number) => Promise<Task>,
        failure: string,
    ) {
        const choice = ++latestChoice.current;
        setSelection(shown);
        let answer: Task;
        try {
            const taskId = await savedId();
            answer =
                taskId === null
                    ? await create({ ...latestFields.current, ...shown })
                    : await request(taskId);
            if (taskId !== null) record(answer);
        } catch {
            // A newer choice replaces this one, so this failure has no effect for the user.
            if (!mounted.current || choice !== latestChoice.current) return;
            setSelection(savedSelection.current);
            failureToast.show(failure);
            return;
        }
        if (mounted.current && choice === latestChoice.current) {
            setSelection({
                projectId: answer.projectId,
                initiativeId: answer.initiativeId,
            });
        }
    }

    function chooseProject(projectId: number | null) {
        void choose(
            // An initiative belongs to one project, so another project clears it.
            { projectId, initiativeId: null },
            (taskId) => setTaskProject(taskId, projectId),
            "Couldn't change the project. Try again.",
        );
    }

    function chooseInitiative(initiativeId: number | null) {
        const initiative = choices?.initiatives.find(
            (i) => i.id === initiativeId,
        );
        void choose(
            {
                projectId: initiative?.projectId ?? selection.projectId,
                initiativeId,
            },
            (taskId) => setTaskInitiative(taskId, initiativeId),
            "Couldn't change the initiative. Try again.",
        );
    }

    async function deleteTask() {
        setDeleting(true);
        try {
            // A change that is not saved would be saved again when the form unmounts, and
            // could rename the task after the delete toast shows its title.
            if (!(await flush())) {
                failureToast.show("Couldn't delete the task. Try again.");
                return;
            }
            await onDelete(savedTitle.current);
        } finally {
            if (mounted.current) setDeleting(false);
        }
    }

    const changeDescription = useCallback(
        (description: string) =>
            setFields((current) => ({ ...current, description })),
        [],
    );

    const completedAt = task?.completedAt ?? null;
    const extraRows =
        (meeting === null ? 0 : 1) + (completedAt === null ? 0 : 1);

    return (
        // The title, the select boxes, the meeting, and the completion date are at the top,
        // and the "Delete" and "Save" buttons are at the bottom. The description gets the
        // remaining height and scrolls its text itself.
        <div
            className={cn(
                "grid min-h-0 flex-1",
                extraRows === 0 && "grid-rows-[auto_auto_minmax(0,1fr)_auto]",
                extraRows === 1 &&
                    "grid-rows-[auto_auto_auto_minmax(0,1fr)_auto]",
                extraRows === 2 &&
                    "grid-rows-[auto_auto_auto_auto_minmax(0,1fr)_auto]",
            )}
        >
            {/* The right padding keeps the close button of the sheet clear of the save status. */}
            <div className="flex flex-col gap-1.5 py-4 pr-14 pl-6">
                <label htmlFor={titleId} className={FIELD_LABEL_CLASSES}>
                    Title
                </label>
                <div className="flex items-start gap-2">
                    <Input
                        ref={titleRef}
                        id={titleId}
                        aria-label="Task title"
                        value={fields.title}
                        placeholder={taskTitle({ title: "" })}
                        onChange={(event) => {
                            const title = event.target.value;
                            setFields((current) => ({ ...current, title }));
                        }}
                        className={cn("min-w-0 flex-1", NAME_FIELD_CLASSES)}
                    />
                    <div className="flex h-10 shrink-0 items-center">
                        {(id !== null || status === "error") && (
                            <SaveStatus status={status} onRetry={retry} />
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-start gap-4 px-6 pb-4">
                <TaskProjectField
                    projects={choices?.projects ?? null}
                    value={selection.projectId}
                    onChange={chooseProject}
                />
                <TaskInitiativeField
                    initiatives={choices?.initiatives ?? null}
                    projectId={selection.projectId}
                    value={selection.initiativeId}
                    onChange={chooseInitiative}
                />
            </div>
            {meeting !== null && (
                <div className="flex flex-col items-start gap-1.5 px-6 pb-4">
                    <span className={FIELD_LABEL_CLASSES}>Meeting</span>
                    <p className="pl-[calc(--spacing(2.5)+1px)] text-sm">
                        {meeting.deleted ? (
                            `${meetingDisplayName(meeting.name)} (deleted)`
                        ) : (
                            // The link closes the sheet first, which saves a change that waits.
                            <Link
                                to={`/meetings/${meeting.id}`}
                                onClick={onClose}
                                className="underline"
                            >
                                {meetingDisplayName(meeting.name)}
                            </Link>
                        )}
                    </p>
                </div>
            )}
            {completedAt !== null && (
                <p className="px-6 pb-4 text-sm text-muted-foreground">
                    Completed on {completionDate(completedAt)}
                </p>
            )}
            <MarkdownEditor
                initialMarkdown={task?.description ?? ""}
                onChange={changeDescription}
                label="Description"
            />
            <div className="flex items-center justify-between border-t px-6 py-4">
                {id !== null ? (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={deleting}
                        onClick={() => void deleteTask()}
                    >
                        <Trash2Icon />
                        Delete
                    </Button>
                ) : (
                    // Keeps "Save" at the right.
                    <span />
                )}
                <Button size="sm" onClick={onClose}>
                    Save
                </Button>
            </div>
        </div>
    );
}
