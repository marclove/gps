import { Trash2Icon } from "lucide-react";
import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type Ref,
    type RefObject,
} from "react";
import { Link } from "react-router";
import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import { SaveStatus } from "@/components/save-status";
import { useFailureToast } from "@/components/use-failure-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { useAutosave } from "@/hooks/use-autosave";
import {
    createInitiative,
    initiativeDisplayName,
    RACI_ROLES,
    renameInitiative,
    setInitiativeProject,
    updateInitiative,
    type Initiative,
    type InitiativeSummary,
    type MoveToProjectResult,
    type RaciRole,
} from "@/lib/initiatives";
import {
    listProjects,
    projectDisplayName,
    sortProjects,
    type Project,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

/**
 * The fields of an initiative that the form saves automatically. `projectId` is used only
 * while the initiative is a draft. After the create, a change of the project is saved at
 * once, and not with these values.
 */
type Draft = {
    name: string;
    description: string;
    raciRole: RaciRole | null;
    /** The project of a draft, or `null` while the user has not chosen one. */
    projectId: number | null;
};

/**
 * Returns true if the values are the values of a new draft: a name that is empty after
 * removing the spaces at its start and end, an empty description, and no role. The project
 * does not count. Such a draft is never saved.
 */
function isEmptyDraft(values: Draft): boolean {
    return (
        values.name.trim() === "" &&
        values.description === "" &&
        values.raciRole === null
    );
}

/** Returns the summary of an initiative, which is the initiative without its description. */
function toSummary(initiative: Initiative): InitiativeSummary {
    const summary: InitiativeSummary & { description?: string } = {
        ...initiative,
    };
    delete summary.description;
    return summary;
}

/** The state of the list of projects that the "Project" select box offers. */
type ProjectsLoad =
    | { kind: "loading" }
    | { kind: "error" }
    /** The projects that are not deleted, sorted by the shown name. */
    | { kind: "loaded"; projects: Project[] };

/** Returns the value of the "Project" select box for a project identifier. The empty value means no project. */
function toValue(projectId: number | null): string {
    return projectId === null ? "" : String(projectId);
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
 * The classes of the name field. The name is larger than the text of the other fields.
 * The input sets a smaller size for wide windows (`md:text-sm`), so this sets it again.
 */
export const NAME_FIELD_CLASSES = "h-10 text-lg font-semibold md:text-lg";

/**
 * The classes of a label above a field. The label starts where the text inside the field
 * starts: after the border (1px) and the left padding of the field.
 */
export const FIELD_LABEL_CLASSES = "pl-[calc(--spacing(2.5)+1px)] text-xs";

/**
 * The fields of one initiative: its name with the save status, its role, its project, the
 * date of completion if it is completed, its description, a "Delete" button, and a "Save"
 * button.
 * Changes are saved automatically. "Save" only calls `onSave`, which closes the sheet, and
 * the form then saves the changes that are waiting when it unmounts.
 *
 * When `initiative` is `null`, the form edits a draft: a new initiative with an empty name,
 * an empty description, and no role, which is not saved yet. The draft has no "Delete" button
 * and no save status, but a failed save shows "Couldn't save". The draft starts in the project
 * `draftProjectId`. If `draftProjectId` is `null`, it starts in the only project when exactly
 * one project exists, and otherwise on the empty choice. The form creates the initiative at
 * the first save of a draft that has a project and is not empty, and then saves later changes
 * as for any other initiative. While the draft has a name, a role, or a description but no
 * project, the "Project" select box is marked as invalid with the message "Choose a project to
 * save this initiative.", and "Save" moves the focus to the select box and does not call
 * `onSave`. When no project exists, the "Project" select box is disabled, and a text with a
 * link to the Projects page tells the user to create a project first. The form must be in a
 * router. If the name of the draft is taken, the name field shows a message, and the form
 * creates the initiative with an empty name when the draft has a description or a role.
 * After the create, `onSaved` receives the summary, also when the create finishes after the
 * form unmounts, and `onCreated` receives the identifier while the form is mounted.
 *
 * The "Project" select box offers the projects that are not deleted, sorted by the shown
 * name. For a saved initiative, it has no empty choice, and a change moves the initiative to
 * the other project at once. If another initiative of that project has the name, the select
 * box goes back and shows a message. If the move fails, the select box goes back and the form
 * shows a failure toast. `onSaved` receives the summary after the move.
 *
 * A name change is saved with a rename. If another initiative has the name, the name field
 * shows a message, and the other changes are still saved. `onSaved` receives the summary of
 * the initiative after each save that succeeds, also when the save finishes after the form
 * unmounts. When the user clicks "Delete", the form first saves the changes that are
 * waiting, and then calls `onDelete` with the name that the backend has for the initiative.
 * If a change cannot be saved, the form does not call `onDelete` and shows the failure toast
 * "Couldn't delete the initiative. Try again." The form must be in a `FailureToastProvider`.
 * The button is disabled until the promise of `onDelete` settles. `nameRef` receives the
 * name field.
 */
export function InitiativeForm({
    initiative,
    draftProjectId,
    onSaved,
    onCreated,
    onDelete,
    onSave,
    nameRef,
}: {
    initiative: Initiative | null;
    draftProjectId: number | null;
    onSaved: (summary: InitiativeSummary) => void;
    onCreated?: (id: number) => void;
    onDelete: (savedName: string) => Promise<void>;
    onSave: () => void;
    nameRef?: Ref<HTMLInputElement>;
}) {
    const [draft, setDraft] = useState<Draft>(
        initiative === null
            ? {
                  name: "",
                  description: "",
                  raciRole: null,
                  projectId: draftProjectId,
              }
            : {
                  name: initiative.name,
                  description: initiative.description,
                  raciRole: initiative.raciRole,
                  projectId: initiative.projectId,
              },
    );
    const [projectsLoad, setProjectsLoad] = useState<ProjectsLoad>({
        kind: "loading",
    });
    const [projectsAttempt, setProjectsAttempt] = useState(0);
    const [takenName, setTakenName] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    // The identifier of the initiative, or `null` while the draft is not saved. The ref gives
    // the identifier to a save that finishes after the form unmounts.
    const [id, setId] = useState(initiative?.id ?? null);
    const idRef = useRef(initiative?.id ?? null);
    // The name that the backend has for the initiative. The backend trims names.
    const savedName = useRef(initiative?.name ?? "");
    // The values that the backend has now. They are refs, so that a save that finishes after
    // the form unmounts still compares with the correct values.
    const saved = useRef<Draft>({ ...draft });
    const mounted = useRef(true);
    const onSavedRef = useRef(onSaved);
    const onCreatedRef = useRef(onCreated);
    // The project of the initiative when it was loaded or created. After that, the select box
    // of a saved initiative keeps the project.
    const [savedProjectId, setSavedProjectId] = useState(
        initiative?.projectId ?? null,
    );
    const nameId = useId();
    const roleId = useId();
    const messageId = useId();
    // The control of the Project field that needs the user: the select box, the link to the
    // Projects page when no project exists, or "Retry" when the projects cannot be loaded.
    const draftProjectRef = useRef<HTMLElement>(null);

    useEffect(() => {
        onSavedRef.current = onSaved;
        onCreatedRef.current = onCreated;
    }, [onSaved, onCreated]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        let current = true;
        listProjects({ includeDeleted: false }).then(
            (loaded) => {
                if (!current) return;
                setProjectsLoad({
                    kind: "loaded",
                    projects: sortProjects(loaded),
                });
                // A draft that did not get a project starts in the only project.
                if (loaded.length === 1) {
                    setDraft((values) =>
                        values.projectId === null
                            ? { ...values, projectId: loaded[0].id }
                            : values,
                    );
                }
            },
            () => current && setProjectsLoad({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [projectsAttempt]);

    const retryProjects = useCallback(() => {
        setProjectsLoad({ kind: "loading" });
        setProjectsAttempt((value) => value + 1);
    }, []);

    // Creates the initiative from a draft that has a project and is not empty. If the name is
    // taken, the draft is created with an empty name when it has a description or a role.
    const create = useCallback(async (next: Draft) => {
        if (isEmptyDraft(next)) {
            if (mounted.current) setTakenName(null);
            return;
        }
        const projectId = next.projectId;
        if (projectId === null) return;
        let result = await createInitiative({ ...next, projectId });
        let values = next;
        if (result.status === "nameTaken") {
            // A name that is taken is not a failed save.
            if (mounted.current) setTakenName(next.name.trim());
            values = { ...next, name: "" };
            if (isEmptyDraft(values)) return;
            result = await createInitiative({ ...values, projectId });
            // An empty name is never taken.
            if (result.status === "nameTaken") return;
        } else if (mounted.current) {
            setTakenName(null);
        }
        const created = result.initiative;
        idRef.current = created.id;
        saved.current = { ...values };
        savedName.current = created.name;
        onSavedRef.current(toSummary(created));
        if (mounted.current) {
            setSavedProjectId(created.projectId);
            setId(created.id);
            onCreatedRef.current?.(created.id);
        }
    }, []);

    const save = useCallback(
        async (next: Draft) => {
            const savedId = idRef.current;
            if (savedId === null) {
                await create(next);
                return;
            }
            if (next.name !== saved.current.name) {
                const result = await renameInitiative(savedId, next.name);
                if (result.status === "renamed") {
                    saved.current.name = next.name;
                    savedName.current = result.initiative.name;
                    onSavedRef.current(toSummary(result.initiative));
                    if (mounted.current) setTakenName(null);
                } else if (mounted.current) {
                    // A name that is taken is not a failed save, so the save continues.
                    setTakenName(next.name.trim());
                }
            } else if (mounted.current) {
                setTakenName(null);
            }
            if (
                next.description !== saved.current.description ||
                next.raciRole !== saved.current.raciRole
            ) {
                const changes = {
                    description: next.description,
                    raciRole: next.raciRole,
                };
                const updated = await updateInitiative(savedId, changes);
                saved.current = { ...saved.current, ...changes };
                onSavedRef.current(toSummary(updated));
            }
        },
        [create],
    );
    const { status, retry, flush } = useAutosave(draft, save);
    const failureToast = useFailureToast();

    async function deleteInitiative() {
        setDeleting(true);
        try {
            // A change that is not saved would be saved again when the form unmounts, and
            // could rename the initiative after the delete toast shows its name.
            if (!(await flush())) {
                failureToast.show("Couldn't delete the initiative. Try again.");
                return;
            }
            await onDelete(savedName.current);
        } finally {
            if (mounted.current) setDeleting(false);
        }
    }

    const completedAt = initiative?.completedAt ?? null;

    // A draft with content but no project cannot be saved, so "Save" does not close the sheet.
    const unsaveable =
        id === null && draft.projectId === null && !isEmptyDraft(draft);
    // The form asks for a project when the user can choose one. When no project exists, the
    // "Project" field tells the user to create one instead.
    const projectMissing =
        unsaveable &&
        projectsLoad.kind === "loaded" &&
        projectsLoad.projects.length > 0;

    function clickSave() {
        if (unsaveable) {
            draftProjectRef.current?.focus();
            return;
        }
        onSave();
    }

    const changeDescription = useCallback(
        (description: string) =>
            setDraft((current) => ({ ...current, description })),
        [],
    );

    return (
        // The header, the role, and the completion date are at the top, and the "Delete"
        // and "Save" buttons are at the bottom. The description gets the remaining height and scrolls
        // its text itself.
        <div
            className={cn(
                "grid min-h-0 flex-1",
                completedAt === null
                    ? "grid-rows-[auto_auto_minmax(0,1fr)_auto]"
                    : "grid-rows-[auto_auto_auto_minmax(0,1fr)_auto]",
            )}
        >
            {/* The right padding keeps the close button of the sheet clear of the save status. */}
            <div className="flex flex-col gap-1.5 py-4 pr-14 pl-6">
                <label htmlFor={nameId} className={FIELD_LABEL_CLASSES}>
                    Name
                </label>
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <Input
                            ref={nameRef}
                            id={nameId}
                            aria-label="Initiative name"
                            value={draft.name}
                            placeholder={initiativeDisplayName("")}
                            aria-invalid={takenName !== null || undefined}
                            aria-describedby={
                                takenName !== null ? messageId : undefined
                            }
                            onChange={(event) => {
                                const name = event.target.value;
                                setDraft((current) => ({ ...current, name }));
                            }}
                            className={NAME_FIELD_CLASSES}
                        />
                        {takenName !== null && (
                            <p
                                id={messageId}
                                className="mt-1 text-sm text-destructive"
                            >
                                Another initiative is named "{takenName}".
                            </p>
                        )}
                    </div>
                    <div className="flex h-10 shrink-0 items-center">
                        {(id !== null || status === "error") && (
                            <SaveStatus status={status} onRetry={retry} />
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-start gap-4 px-6 pb-4">
                <div className="flex flex-col items-start gap-1.5">
                    <label htmlFor={roleId} className={FIELD_LABEL_CLASSES}>
                        Role
                    </label>
                    <NativeSelect
                        id={roleId}
                        aria-label="RACI role"
                        value={draft.raciRole ?? ""}
                        onChange={(event) => {
                            // The empty choice means that the user has no role.
                            const value = event.target.value;
                            const raciRole =
                                value === "" ? null : (value as RaciRole);
                            setDraft((current) => ({ ...current, raciRole }));
                        }}
                    >
                        <NativeSelectOption value="" />
                        {RACI_ROLES.map((role) => (
                            <NativeSelectOption
                                key={role.value}
                                value={role.value}
                            >
                                {role.label}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                </div>
                {id === null ? (
                    <ProjectField
                        focusRef={draftProjectRef}
                        load={projectsLoad}
                        onRetry={retryProjects}
                        value={toValue(draft.projectId)}
                        allowEmpty
                        message={
                            projectMissing
                                ? "Choose a project to save this initiative."
                                : null
                        }
                        onChange={(value) => {
                            const projectId =
                                value === "" ? null : Number(value);
                            setDraft((current) => ({ ...current, projectId }));
                        }}
                    />
                ) : (
                    <SavedProjectField
                        // A draft gets a new field when it is created, which starts on the
                        // project of the create.
                        key={id}
                        initiativeId={id}
                        initialProjectId={savedProjectId}
                        savedName={savedName}
                        load={projectsLoad}
                        onRetry={retryProjects}
                        onMoved={(summary) => onSavedRef.current(summary)}
                    />
                )}
            </div>
            {completedAt !== null && (
                <p className="px-6 pb-4 text-sm text-muted-foreground">
                    Completed on {completionDate(completedAt)}
                </p>
            )}
            <MarkdownEditor
                initialMarkdown={initiative?.description ?? ""}
                onChange={changeDescription}
                label="Description"
            />
            <div className="flex items-center justify-between border-t px-6 py-4">
                {id !== null ? (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={deleting}
                        onClick={() => void deleteInitiative()}
                    >
                        <Trash2Icon />
                        Delete
                    </Button>
                ) : (
                    // Keeps "Save" at the right.
                    <span />
                )}
                <Button size="sm" onClick={clickSave}>
                    Save
                </Button>
            </div>
        </div>
    );
}

/**
 * The "Project" label, the select box, and the texts below it. The choices are the loaded
 * projects, after an empty choice when `allowEmpty` is true. The select box is disabled while
 * the projects load and when no project exists. When no project exists, a text tells the user
 * to create a project first and links to the Projects page. When the projects cannot be
 * loaded, the field shows a message and a "Retry" button, which calls `onRetry`, in place of
 * the select box. `message` shows below the select box and describes it. `focusRef` receives
 * the control that the user must use next: the select box when projects exist, the link to
 * the Projects page when no project exists, or "Retry" when the projects cannot be loaded.
 */
function ProjectField({
    focusRef,
    load,
    onRetry,
    value,
    allowEmpty,
    message,
    onChange,
}: {
    focusRef?: RefObject<HTMLElement | null>;
    load: ProjectsLoad;
    onRetry: () => void;
    value: string;
    allowEmpty: boolean;
    message: string | null;
    onChange: (value: string) => void;
}) {
    const selectId = useId();
    const messageId = useId();
    const setFocusTarget = (element: HTMLElement | null) => {
        if (focusRef) focusRef.current = element;
    };
    if (load.kind === "error") {
        return (
            <div className="flex min-w-0 flex-col items-start gap-1.5">
                <span className={FIELD_LABEL_CLASSES}>Project</span>
                <div className="flex items-center gap-2 text-sm">
                    <p>Couldn't load projects</p>
                    <Button
                        ref={setFocusTarget}
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                    >
                        Retry
                    </Button>
                </div>
            </div>
        );
    }
    const projects = load.kind === "loaded" ? load.projects : null;
    const noProjects = projects?.length === 0;
    return (
        <div className="flex min-w-0 flex-col items-start gap-1.5">
            <label htmlFor={selectId} className={FIELD_LABEL_CLASSES}>
                Project
            </label>
            <NativeSelect
                // A long name must not make the select box wider than the sheet.
                className="min-w-0"
                // A disabled select box cannot take the focus.
                ref={noProjects ? undefined : setFocusTarget}
                id={selectId}
                value={value}
                disabled={projects === null || projects.length === 0}
                aria-invalid={message !== null || undefined}
                aria-describedby={message !== null ? messageId : undefined}
                onChange={(event) => onChange(event.target.value)}
            >
                {allowEmpty && <NativeSelectOption value="" />}
                {projects?.map((project) => (
                    <NativeSelectOption
                        key={project.id}
                        value={String(project.id)}
                    >
                        {projectDisplayName(project.name)}
                    </NativeSelectOption>
                ))}
            </NativeSelect>
            {noProjects && (
                <p className="text-sm text-muted-foreground">
                    Create a project first.{" "}
                    <Link
                        ref={setFocusTarget}
                        to="/projects"
                        className="underline"
                    >
                        Projects
                    </Link>
                </p>
            )}
            {message !== null && (
                <p id={messageId} className="text-sm text-destructive">
                    {message}
                </p>
            )}
        </div>
    );
}

/**
 * The "Project" field of a saved initiative. A change moves the initiative to the other
 * project at once. A request that finishes after a newer one does not change the select box.
 * If another initiative of the project has the name, the select box goes back to the saved
 * project and a message says so. If the move fails, the select box goes back and a failure
 * toast shows. `onMoved` receives the summary after each move that succeeds, also when the
 * move finishes after the field unmounts.
 *
 * `initialProjectId` is the project of the initiative when the field mounts. `savedName`
 * holds the name that the backend has for the initiative. `load` is the state of the list of
 * projects, and `onRetry` loads it again.
 */
function SavedProjectField({
    initiativeId,
    initialProjectId,
    savedName,
    load,
    onRetry,
    onMoved,
}: {
    initiativeId: number;
    initialProjectId: number | null;
    savedName: RefObject<string>;
    load: ProjectsLoad;
    onRetry: () => void;
    onMoved: (summary: InitiativeSummary) => void;
}) {
    const [shown, setShown] = useState(toValue(initialProjectId));
    const [message, setMessage] = useState<string | null>(null);
    // The value that was saved last, with the number of its request.
    const saved = useRef({ request: 0, value: toValue(initialProjectId) });
    // The number of the latest request that moves the initiative.
    const latestRequest = useRef(0);
    // The numbers of the requests that have not ended.
    const pendingRequests = useRef(new Set<number>());
    const failureToast = useFailureToast();

    async function move(value: string) {
        const request = ++latestRequest.current;
        pendingRequests.current.add(request);
        setShown(value);
        setMessage(null);
        const project =
            load.kind === "loaded"
                ? load.projects.find((p) => String(p.id) === value)
                : undefined;
        let result: MoveToProjectResult;
        try {
            result = await setInitiativeProject(initiativeId, Number(value));
        } catch {
            pendingRequests.current.delete(request);
            // A newer choice replaces this one, so this failure has no effect for the user.
            if (request !== latestRequest.current) return;
            setShown(saved.current.value);
            failureToast.show(
                "Couldn't move the initiative to the project. Try again.",
            );
            return;
        }
        pendingRequests.current.delete(request);
        if (result.status === "moved") {
            // An older request that ends after a newer one does not replace the value of the
            // newer one.
            if (request < saved.current.request) return;
            saved.current = { request, value };
            onMoved(toSummary(result.initiative));
            // When all newer requests have ended without a move, this value is the value in
            // the database, so the select box shows it.
            const newerPending = [...pendingRequests.current].some(
                (other) => other > request,
            );
            if (!newerPending) setShown(value);
            return;
        }
        if (request !== latestRequest.current) return;
        setShown(saved.current.value);
        setMessage(
            `Another initiative in "${projectDisplayName(project?.name ?? "")}" is named "${savedName.current}".`,
        );
    }

    return (
        <ProjectField
            load={load}
            onRetry={onRetry}
            value={shown}
            allowEmpty={false}
            message={message}
            onChange={(value) => void move(value)}
        />
    );
}
