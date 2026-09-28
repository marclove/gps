import { Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import { PageHeader } from "@/components/page-header";
import { PAGE_TITLE_CLASSES } from "@/components/page-title";
import { SaveStatus } from "@/components/save-status";
import { DeleteRefusedError, useDelete } from "@/components/use-delete";
import { useFailureToast } from "@/components/use-failure-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAutosave } from "@/hooks/use-autosave";
import {
    createProject,
    projectDisplayName,
    renameProject,
    updateProject,
    type Project,
} from "@/lib/projects";
import { cn } from "@/lib/utils";
import { ProjectDetailsSidebar } from "./project-details-sidebar";
import type { ProjectsPageState } from "./projects-page";

/** The fields of a project that the editor edits. */
type Draft = {
    name: string;
    description: string;
};

/** The values of a draft, which is a new project that is not saved yet. */
const EMPTY_DRAFT: Draft = { name: "", description: "" };

/**
 * Returns true if the values are the values of a new draft: a name that is empty after
 * removing the spaces at its start and end, and an empty description. Such a draft is never
 * saved.
 */
function isEmptyDraft(values: Draft): boolean {
    return values.name.trim() === "" && values.description === "";
}

/**
 * The editor for one project: its name and its description at the left, and the "Project
 * details" sidebar at the right. Changes are saved automatically.
 *
 * When `project` is `null`, the editor edits a draft: a new project with an empty name and an
 * empty description, which is not saved yet. The name field gets the focus. The draft has no
 * "Delete" button and no save status, but a failed save shows "Couldn't save". The editor
 * creates the project at the first save of a draft that is not empty, calls `onCreated` with
 * its identifier while the editor is mounted, and then saves later changes as for any other
 * project. If the name of the draft is taken, the name field shows a message, and the editor
 * creates the project with an empty name when the draft has a description.
 *
 * A name change is saved with a rename. If another project has the name, the name field
 * shows a message, and the description is still saved. When the user clicks "Delete", the
 * editor first saves the changes that are waiting, then deletes the project, and opens the
 * Projects page with the focus on "New project".
 */
export function ProjectEditor({
    project,
    onCreated,
}: {
    project: Project | null;
    onCreated: (id: number) => void;
}) {
    const [draft, setDraft] = useState<Draft>(
        project === null
            ? EMPTY_DRAFT
            : { name: project.name, description: project.description },
    );
    const [takenName, setTakenName] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    // The identifier of the project, or `null` while the draft is not saved. The ref gives the
    // identifier to a save that finishes after the editor unmounts.
    const [id, setId] = useState(project?.id ?? null);
    const idRef = useRef(project?.id ?? null);
    // The name that the backend has for the project. The backend trims names. The state
    // shows it in the breadcrumb, and the ref gives it to the delete.
    const [savedName, setSavedName] = useState(project?.name ?? "");
    const savedNameRef = useRef(project?.name ?? "");
    // The values that the backend has now. They are refs, so that a save that finishes after
    // the editor unmounts still compares with the correct values.
    const saved = useRef<Draft>({ ...draft });
    const mounted = useRef(true);
    const onCreatedRef = useRef(onCreated);
    const nameInput = useRef<HTMLInputElement>(null);
    const messageId = useId();
    const navigate = useNavigate();
    const { deleteItem } = useDelete();
    const failureToast = useFailureToast();
    const isDraft = project === null;

    useEffect(() => {
        onCreatedRef.current = onCreated;
    }, [onCreated]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (isDraft) nameInput.current?.focus();
    }, [isDraft]);

    const rememberName = useCallback((name: string) => {
        savedNameRef.current = name;
        if (mounted.current) setSavedName(name);
    }, []);

    // Creates the project from a draft that is not empty. If the name is taken, the draft is
    // created with an empty name when it has a description.
    const create = useCallback(
        async (next: Draft) => {
            if (isEmptyDraft(next)) {
                if (mounted.current) setTakenName(null);
                return;
            }
            let result = await createProject(next);
            let values = next;
            if (result.status === "nameTaken") {
                // A name that is taken is not a failed save.
                if (mounted.current) setTakenName(next.name.trim());
                values = { ...next, name: "" };
                if (isEmptyDraft(values)) return;
                result = await createProject(values);
                // An empty name is never taken.
                if (result.status === "nameTaken") return;
            } else if (mounted.current) {
                setTakenName(null);
            }
            const created = result.project;
            idRef.current = created.id;
            saved.current = { ...values };
            rememberName(created.name);
            if (mounted.current) {
                setId(created.id);
                onCreatedRef.current(created.id);
            }
        },
        [rememberName],
    );

    const save = useCallback(
        async (next: Draft) => {
            const savedId = idRef.current;
            if (savedId === null) {
                await create(next);
                return;
            }
            if (next.name !== saved.current.name) {
                const result = await renameProject(savedId, next.name);
                if (result.status === "renamed") {
                    saved.current.name = next.name;
                    rememberName(result.project.name);
                    if (mounted.current) setTakenName(null);
                } else if (mounted.current) {
                    // A name that is taken is not a failed save, so the save continues.
                    setTakenName(next.name.trim());
                }
            } else if (mounted.current) {
                setTakenName(null);
            }
            if (next.description !== saved.current.description) {
                await updateProject(savedId, next.description);
                saved.current.description = next.description;
            }
        },
        [create, rememberName],
    );
    const { status, retry, flush } = useAutosave(draft, save);

    const changeDescription = useCallback(
        (description: string) =>
            setDraft((current) => ({ ...current, description })),
        [],
    );

    async function handleDelete() {
        const deleteId = idRef.current;
        if (deleteId === null) return;
        setDeleting(true);
        try {
            // A change that is not saved would be saved again when the editor unmounts, and
            // could rename the project after the delete toast shows its name.
            if (!(await flush())) {
                failureToast.show("Couldn't delete the project. Try again.");
                return;
            }
            await deleteItem({
                kind: "project",
                id: deleteId,
                name: savedNameRef.current,
            });
            failureToast.clear();
            const state: ProjectsPageState = { focusNewProject: true };
            navigate("/projects", { state });
        } catch (error) {
            failureToast.show(
                error instanceof DeleteRefusedError
                    ? error.message
                    : "Couldn't delete the project. Try again.",
            );
        } finally {
            if (mounted.current) setDeleting(false);
        }
    }

    return (
        // The name and the description are at the left, and the project details sidebar is
        // at the right, as tall as the main area. In the left column, the header and the name
        // row stay in place, and the description editor gets the remaining height and scrolls
        // its text itself.
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(18rem,calc(11rem_+_11vw),24rem)] grid-rows-[minmax(0,1fr)]">
            <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]">
                <PageHeader
                    crumbs={[
                        { label: "Projects", to: "/projects" },
                        { label: projectDisplayName(savedName) },
                    ]}
                >
                    {(id !== null || status === "error") && (
                        <SaveStatus status={status} onRetry={retry} />
                    )}
                </PageHeader>
                <div className="px-6 pb-4">
                    <Input
                        ref={nameInput}
                        aria-label="Project name"
                        value={draft.name}
                        placeholder={projectDisplayName("")}
                        aria-invalid={takenName !== null || undefined}
                        aria-describedby={
                            takenName !== null ? messageId : undefined
                        }
                        onChange={(event) => {
                            const name = event.target.value;
                            setDraft((current) => ({ ...current, name }));
                        }}
                        className={cn(
                            PAGE_TITLE_CLASSES,
                            "h-auto border-none px-0 shadow-none focus-visible:ring-0",
                        )}
                    />
                    {takenName !== null && (
                        <p
                            id={messageId}
                            className="mt-1 text-sm text-destructive"
                        >
                            Another project is named "{takenName}".
                        </p>
                    )}
                </div>
                <MarkdownEditor
                    initialMarkdown={project?.description ?? ""}
                    onChange={changeDescription}
                    label="Description"
                />
            </div>
            <ProjectDetailsSidebar
                actions={
                    id !== null && (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={deleting}
                            onClick={() => void handleDelete()}
                        >
                            <Trash2Icon />
                            Delete
                        </Button>
                    )
                }
            />
        </div>
    );
}
