import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { useDelete } from "@/components/use-delete";
import { useFailureToast } from "@/components/use-failure-toast";
import { setMeetingProject, type Meeting } from "@/lib/meetings";
import {
    listProjects,
    projectDisplayName,
    sortProjects,
    type Project,
} from "@/lib/projects";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; open: Project[]; deleted: Project[] };

/** Returns the value of the select box for a project identifier. The empty value means no project. */
function toValue(projectId: number | null): string {
    return projectId === null ? "" : String(projectId);
}

/**
 * The "Project" row of the meeting details sidebar. It shows a select box with the projects
 * that are not deleted, sorted by the shown name, and the project of the meeting. If that
 * project is deleted, it is the last choice until the user chooses another one. When the user
 * chooses a project, the choice is saved at once, and `onSaved` gets the stored meeting. If
 * the projects cannot be loaded, the row shows a message and a Retry button.
 *
 * The choices load again after an item is deleted or restored. The row must be in a
 * `DeleteProvider`.
 *
 * `projectId` is the project of the meeting when the row opens. After that, the row keeps the
 * choice of the user.
 */
export function MeetingProjectSelect({
    meetingId,
    projectId,
    onSaved,
}: {
    meetingId: number;
    projectId: number | null;
    onSaved: (meeting: Meeting) => void;
}) {
    const selectId = useId();
    const [load, setLoad] = useState<LoadState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [shown, setShown] = useState(toValue(projectId));
    // The value that was saved last, with the number of its request.
    const saved = useRef({ request: 0, value: toValue(projectId) });
    // The number of the latest request that saves a choice.
    const latestRequest = useRef(0);
    // The number of the newest request that failed.
    const failedRequest = useRef(0);
    // The numbers of the requests that have not ended.
    const pendingRequests = useRef(new Set<number>());
    const failureToast = useFailureToast();
    // Counts deletes and restores, so the choices load again when a project is deleted or
    // restored, for example with Undo while this row is open.
    const { version: deleteVersion } = useDelete();

    useEffect(() => {
        let current = true;
        listProjects({ includeDeleted: true }).then(
            (projects) =>
                current &&
                setLoad({
                    kind: "loaded",
                    open: sortProjects(
                        projects.filter((p) => p.deletedAt === null),
                    ),
                    deleted: projects.filter((p) => p.deletedAt !== null),
                }),
            () => current && setLoad({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt, deleteVersion]);

    async function choose(value: string) {
        const request = ++latestRequest.current;
        pendingRequests.current.add(request);
        setShown(value);
        try {
            const meeting = await setMeetingProject(
                meetingId,
                value === "" ? null : Number(value),
            );
            pendingRequests.current.delete(request);
            // An older request that ends after a newer one does not replace the value
            // of the newer one.
            if (request > saved.current.request) {
                saved.current = { request, value };
                // When all newer requests have failed, this value is the value in the
                // database, so the select box shows it.
                const newerPending = [...pendingRequests.current].some(
                    (other) => other > request,
                );
                if (!newerPending) setShown(value);
                onSaved(meeting);
            }
            // The toast of a newer request that failed stays open.
            if (request > failedRequest.current) failureToast.clear();
        } catch {
            pendingRequests.current.delete(request);
            // A newer request has already saved the choice that the select box shows, so
            // this failure has no effect for the user.
            if (request < saved.current.request) return;
            failedRequest.current = Math.max(failedRequest.current, request);
            // An older request that fails does not change the choice, because the user
            // has already made a newer choice.
            if (request === latestRequest.current)
                setShown(saved.current.value);
            failureToast.show("Couldn't change the project. Try again.");
        }
    }

    // A deleted project is a choice only while the select box shows it. The select box shows
    // it again if saving another choice fails.
    const shownDeleted =
        load.kind === "loaded"
            ? load.deleted.find((project) => String(project.id) === shown)
            : undefined;

    return (
        <div className="flex items-center justify-between gap-2">
            {load.kind === "error" ? (
                <span className="shrink-0 text-sm font-medium">Project</span>
            ) : (
                <label
                    htmlFor={selectId}
                    className="shrink-0 text-sm font-medium"
                >
                    Project
                </label>
            )}
            {load.kind === "error" ? (
                <div className="flex items-center gap-2 text-sm">
                    <p>Couldn't load projects</p>
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
            ) : (
                <NativeSelect
                    // A long name must not make the select wider than the sidebar.
                    className="min-w-0"
                    id={selectId}
                    aria-label="Meeting project"
                    value={shown}
                    disabled={load.kind === "loading"}
                    onChange={(event) => void choose(event.target.value)}
                >
                    {/* The empty choice means that the meeting has no project. */}
                    <NativeSelectOption value="" />
                    {load.kind === "loaded" &&
                        load.open.map((project) => (
                            <NativeSelectOption
                                key={project.id}
                                value={String(project.id)}
                            >
                                {projectDisplayName(project.name)}
                            </NativeSelectOption>
                        ))}
                    {shownDeleted && (
                        <NativeSelectOption value={String(shownDeleted.id)}>
                            {projectDisplayName(shownDeleted.name)}
                        </NativeSelectOption>
                    )}
                </NativeSelect>
            )}
        </div>
    );
}
