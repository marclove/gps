import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getProject, type Project } from "@/lib/projects";
import { ProjectEditor } from "./project-editor";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "not-found" }
    | { kind: "loaded"; project: Project };

/**
 * The page of one project, by the identifier in the route. For the identifier "new", it
 * shows the editor of a draft. When the draft is created, the route changes to the
 * identifier of the new project, and the same editor stays, so the text that the user types
 * is not lost. For any other identifier, the page loads the project, also a deleted one, and
 * shows its editor.
 */
export function ProjectPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    // Each draft gets a new editor. The project that a draft created stays in the editor of
    // the draft, so that the editor is not loaded again.
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
        }
    }

    const onCreated = useCallback(
        (createdId: number) => {
            setDraft((current) => ({ ...current, createdId }));
            navigate(`/projects/${createdId}`, { replace: true });
        },
        [navigate],
    );

    if (id === "new" || Number(id) === draft.createdId) {
        return (
            <ProjectEditor
                key={`draft-${draft.count}`}
                project={null}
                onCreated={onCreated}
            />
        );
    }
    // The key gives each project a new loader and editor, so that the editor of one project
    // saves its changes before the editor of the next project opens.
    return <ProjectLoader key={id} id={Number(id)} onCreated={onCreated} />;
}

function ProjectLoader({
    id,
    onCreated,
}: {
    id: number;
    onCreated: (id: number) => void;
}) {
    const [load, setLoad] = useState<LoadState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let current = true;
        getProject(id).then(
            (project) => {
                if (!current) return;
                setLoad(
                    project
                        ? { kind: "loaded", project }
                        : { kind: "not-found" },
                );
            },
            () => current && setLoad({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [id, attempt]);

    if (load.kind === "loaded") {
        return <ProjectEditor project={load.project} onCreated={onCreated} />;
    }

    return (
        <>
            <PageHeader crumbs={[{ label: "Projects", to: "/projects" }]} />
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0 text-sm">
                {load.kind === "loading" && (
                    <p className="text-muted-foreground">Loading…</p>
                )}
                {load.kind === "not-found" && (
                    <p>
                        This project doesn't exist.{" "}
                        <Link to="/projects" className="underline">
                            Back to Projects
                        </Link>
                    </p>
                )}
                {load.kind === "error" && (
                    <div className="flex items-center gap-2">
                        <p>Couldn't load this project</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setLoad({ kind: "loading" });
                                setAttempt((value) => value + 1);
                            }}
                        >
                            Retry
                        </Button>
                    </div>
                )}
            </div>
        </>
    );
}
