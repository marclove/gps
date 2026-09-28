import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { PageHeader } from "@/components/page-header";
import { PAGE_TITLE_CLASSES } from "@/components/page-title";
import {
    DeleteRefusedError,
    useDelete,
    type RestoredItem,
} from "@/components/use-delete";
import { useFailureToast } from "@/components/use-failure-toast";
import { Button } from "@/components/ui/button";
import {
    listProjects,
    projectDisplayName,
    sortProjects,
    type Project,
} from "@/lib/projects";

type ListState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; projects: Project[] };

/**
 * State that the project page gives the Projects page after it deletes a project. The
 * Projects page then moves focus to the "New project" button, because the button that the
 * user clicked is gone.
 */
export type ProjectsPageState = { focusNewProject: true };

/**
 * Records a delete so the effect that watches the list can move focus once the list
 * catches up, even if another delete changes the list first.
 */
type DeletedNeighbors = {
    /** The identifier of the deleted project. */
    deletedId: number;
    /** The identifiers of every project in the list, in order, as of the delete. */
    orderedIds: number[];
};

/** The page that lists the projects that are not deleted, and opens a draft of a new one. */
export function ProjectsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const focusNewProject =
        (location.state as ProjectsPageState | null)?.focusNewProject === true;
    const { deleteItem, version, restored } = useDelete();
    const [list, setList] = useState<ListState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const failureToast = useFailureToast();
    const newProjectButtonRef = useRef<HTMLButtonElement>(null);
    const projectLinkRefs = useRef(new Map<number, HTMLAnchorElement>());
    const deleteButtonRefs = useRef(new Map<number, HTMLButtonElement>());
    // The most recent delete that is still waiting for the list to catch up, so the effect
    // below can move focus once it does. `null` means nothing is waiting.
    const deletedNeighbors = useRef<DeletedNeighbors | null>(null);
    // The restored project this page has already moved focus for, so a restore that
    // happened before this page opened, or one this page already reacted to, does not move
    // focus again.
    const handledRestored = useRef<RestoredItem | null>(restored);
    // The identifiers of projects with a delete in progress, so a second click on the same
    // row before the first delete finishes has no effect.
    const pendingDeleteIds = useRef(new Set<number>());

    useEffect(() => {
        if (focusNewProject) newProjectButtonRef.current?.focus();
    }, [focusNewProject]);

    useEffect(() => {
        let current = true;
        listProjects({ includeDeleted: false }).then(
            (projects) =>
                current &&
                setList({ kind: "loaded", projects: sortProjects(projects) }),
            () => current && setList({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt, version]);

    useEffect(() => {
        const neighbors = deletedNeighbors.current;
        if (!neighbors || list.kind !== "loaded") return;
        deletedNeighbors.current = null;

        // Focus the first remaining project that was after the deleted one, in the order
        // that the delete saw, or otherwise the nearest remaining one before it. If no
        // project remains, focus "New project".
        const currentIds = new Set(list.projects.map((project) => project.id));
        const deletedIndex = neighbors.orderedIds.indexOf(neighbors.deletedId);
        const after =
            deletedIndex === -1
                ? []
                : neighbors.orderedIds.slice(deletedIndex + 1);
        const before =
            deletedIndex === -1
                ? []
                : neighbors.orderedIds.slice(0, deletedIndex).reverse();
        const nextId =
            after.find((id) => currentIds.has(id)) ??
            before.find((id) => currentIds.has(id));

        if (nextId !== undefined) {
            deleteButtonRefs.current.get(nextId)?.focus();
        } else {
            newProjectButtonRef.current?.focus();
        }
    }, [list]);

    useEffect(() => {
        // Items of other kinds can have the same identifier as a project, so this page
        // reacts only to a restored project.
        if (
            restored?.kind !== "project" ||
            restored === handledRestored.current
        ) {
            return;
        }
        if (list.kind !== "loaded") return;
        const link = projectLinkRefs.current.get(restored.id);
        if (link) {
            link.focus();
            handledRestored.current = restored;
        }
    }, [restored, list]);

    function retry() {
        setList({ kind: "loading" });
        setAttempt((value) => value + 1);
    }

    async function handleDelete(project: Project) {
        // Ignore a second click on the same row while its delete is still in flight, so it
        // cannot run twice.
        if (pendingDeleteIds.current.has(project.id)) return;
        pendingDeleteIds.current.add(project.id);
        try {
            await deleteItem({
                kind: "project",
                id: project.id,
                name: project.name,
            });
            failureToast.clear();
            // Recorded from the list that this render sees. The effect that watches `list`
            // picks the target once the list catches up.
            if (list.kind === "loaded") {
                deletedNeighbors.current = {
                    deletedId: project.id,
                    orderedIds: list.projects.map((candidate) => candidate.id),
                };
            }
            setList((current) => {
                if (current.kind !== "loaded") return current;
                if (
                    !current.projects.some(
                        (candidate) => candidate.id === project.id,
                    )
                ) {
                    return current;
                }
                return {
                    kind: "loaded",
                    projects: current.projects.filter(
                        (candidate) => candidate.id !== project.id,
                    ),
                };
            });
        } catch (error) {
            failureToast.show(
                error instanceof DeleteRefusedError
                    ? error.message
                    : "Couldn't delete the project. Try again.",
            );
        } finally {
            pendingDeleteIds.current.delete(project.id);
        }
    }

    return (
        // The header and the title stay in place, and the last row, which gets the remaining
        // height, scrolls.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)]">
            <PageHeader crumbs={[{ label: "Projects" }]}>
                <Button
                    ref={newProjectButtonRef}
                    onClick={() => navigate("/projects/new")}
                >
                    <PlusIcon />
                    New project
                </Button>
            </PageHeader>
            <div className="flex flex-col gap-4 px-6 pb-2">
                <h1 className={PAGE_TITLE_CLASSES}>Projects</h1>
            </div>
            {/* `pt-2` leaves room for the focus ring of the first project, which the
                scrolling area would cut off. The title row has 8 pixels less padding, so
                the list stays at the same position. */}
            <div className="overflow-y-auto px-6 pt-2 pb-4">
                {list.kind === "loading" && (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                )}
                {list.kind === "error" && (
                    <div className="flex items-center gap-2 text-sm">
                        <p>Couldn't load projects</p>
                        <Button variant="outline" size="sm" onClick={retry}>
                            Retry
                        </Button>
                    </div>
                )}
                {list.kind === "loaded" && list.projects.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        No projects yet
                    </p>
                )}
                {list.kind === "loaded" && list.projects.length > 0 && (
                    <ul className="flex flex-col gap-1">
                        {list.projects.map((project) => (
                            <li
                                key={project.id}
                                className="group flex items-center gap-1 rounded-lg hover:bg-muted"
                            >
                                <Link
                                    to={`/projects/${project.id}`}
                                    ref={(link) => {
                                        if (link) {
                                            projectLinkRefs.current.set(
                                                project.id,
                                                link,
                                            );
                                        } else {
                                            projectLinkRefs.current.delete(
                                                project.id,
                                            );
                                        }
                                    }}
                                    className="flex flex-1 items-center rounded-lg px-3 py-2 font-medium"
                                >
                                    {projectDisplayName(project.name)}
                                </Link>
                                <Button
                                    ref={(button) => {
                                        if (button) {
                                            deleteButtonRefs.current.set(
                                                project.id,
                                                button,
                                            );
                                        } else {
                                            deleteButtonRefs.current.delete(
                                                project.id,
                                            );
                                        }
                                    }}
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Delete "${projectDisplayName(project.name)}"`}
                                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                    onClick={() => handleDelete(project)}
                                >
                                    <Trash2Icon />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
