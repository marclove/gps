import { useId } from "react";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { setMeetingProject, type Meeting } from "@/lib/meetings";
import {
    listProjects,
    projectDisplayName,
    sortProjects,
    type Project,
} from "@/lib/projects";
import { ChoiceRow } from "./choice-row";
import { useChoices } from "./use-choices";
import { useImmediateSave } from "./use-immediate-save";

type Choices = { open: Project[]; deleted: Project[] };

/** Loads the projects that are not deleted, sorted by the shown name, and the deleted ones. */
function loadChoices(): Promise<Choices> {
    return listProjects({ includeDeleted: true }).then((projects) => ({
        open: sortProjects(projects.filter((p) => p.deletedAt === null)),
        deleted: projects.filter((p) => p.deletedAt !== null),
    }));
}

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
    const { state: load, retry } = useChoices(loadChoices);
    const { shown, choose } = useImmediateSave({
        initial: toValue(projectId),
        save: (value) =>
            setMeetingProject(meetingId, value === "" ? null : Number(value)),
        failureText: "Couldn't change the project. Try again.",
        onSaved,
    });

    // A deleted project is a choice only while the select box shows it. The select box shows
    // it again if saving another choice fails.
    const shownDeleted =
        load.kind === "loaded"
            ? load.choices.deleted.find(
                  (project) => String(project.id) === shown,
              )
            : undefined;

    return (
        <ChoiceRow
            label="Project"
            selectId={selectId}
            failed={load.kind === "error"}
            errorText="Couldn't load projects"
            onRetry={retry}
        >
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
                    load.choices.open.map((project) => (
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
        </ChoiceRow>
    );
}
