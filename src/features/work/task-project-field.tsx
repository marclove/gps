import { useId } from "react";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { byLabel } from "@/lib/initiatives";
import { projectDisplayName, type Project } from "@/lib/projects";
import { FIELD_LABEL_CLASSES } from "@/components/form-field-classes";

/**
 * Returns the projects that the user can choose for a task: the projects that are not
 * deleted, and the deleted project `selected`, if the task has it. The label is the shown
 * name, with " (deleted)" after the name of a deleted project. The choices are sorted by the
 * label without regard to case.
 */
function projectChoices(
    projects: Project[],
    selected: number | null,
): { id: number; label: string }[] {
    return projects
        .filter((p) => p.deletedAt === null || p.id === selected)
        .map((p) => {
            const name = projectDisplayName(p.name);
            return {
                id: p.id,
                label: p.deletedAt === null ? name : `${name} (deleted)`,
            };
        })
        .sort(byLabel);
}

/**
 * The "Project" label and select box of a task. The first choice is "No project". Then come
 * the choices of `projectChoices`. `projects` is `null` while the projects load, and then the
 * select box is disabled. `onChange` receives the chosen project, or `null` for "No project".
 */
export function TaskProjectField({
    projects,
    value,
    onChange,
}: {
    projects: Project[] | null;
    value: number | null;
    onChange: (projectId: number | null) => void;
}) {
    const selectId = useId();
    return (
        <div className="flex min-w-0 flex-col items-start gap-1.5">
            <label htmlFor={selectId} className={FIELD_LABEL_CLASSES}>
                Project
            </label>
            <NativeSelect
                // A long name must not make the select box wider than the sheet.
                className="min-w-0"
                id={selectId}
                value={value === null ? "" : String(value)}
                disabled={projects === null}
                onChange={(event) => {
                    const chosen = event.target.value;
                    onChange(chosen === "" ? null : Number(chosen));
                }}
            >
                <NativeSelectOption value="">No project</NativeSelectOption>
                {projectChoices(projects ?? [], value).map((choice) => (
                    <NativeSelectOption
                        key={choice.id}
                        value={String(choice.id)}
                    >
                        {choice.label}
                    </NativeSelectOption>
                ))}
            </NativeSelect>
        </div>
    );
}
