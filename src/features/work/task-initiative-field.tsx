import { useId } from "react";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { initiativeChoices, type InitiativeSummary } from "@/lib/initiatives";
import { FIELD_LABEL_CLASSES } from "@/features/initiatives/initiative-form";

/**
 * The "Initiative" label and select box of a task. The first choice is "No initiative". Then
 * come the initiatives of the project `projectId` that are not deleted, also completed ones,
 * and the deleted initiative `value`, if the task has it, with " (deleted)" after its name.
 * The choices are sorted by the shown name without regard to case.
 *
 * `initiatives` is `null` while the initiatives load. The select box is disabled while they
 * load and when `projectId` is `null`. `onChange` receives the chosen initiative, or `null`
 * for "No initiative".
 */
export function TaskInitiativeField({
    initiatives,
    projectId,
    value,
    onChange,
}: {
    initiatives: InitiativeSummary[] | null;
    projectId: number | null;
    value: number | null;
    onChange: (initiativeId: number | null) => void;
}) {
    const selectId = useId();
    const choices = initiativeChoices(
        initiatives ?? [],
        projectId,
        new Set(value === null ? [] : [value]),
    );
    return (
        <div className="flex min-w-0 flex-col items-start gap-1.5">
            <label htmlFor={selectId} className={FIELD_LABEL_CLASSES}>
                Initiative
            </label>
            <NativeSelect
                // A long name must not make the select box wider than the sheet.
                className="min-w-0"
                id={selectId}
                value={value === null ? "" : String(value)}
                disabled={initiatives === null || projectId === null}
                onChange={(event) => {
                    const chosen = event.target.value;
                    onChange(chosen === "" ? null : Number(chosen));
                }}
            >
                <NativeSelectOption value="">No initiative</NativeSelectOption>
                {choices.map((choice) => (
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
