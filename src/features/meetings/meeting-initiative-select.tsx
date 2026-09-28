import { useCallback, useId } from "react";
import {
    NativeSelect,
    NativeSelectOptGroup,
    NativeSelectOption,
} from "@/components/ui/native-select";
import {
    deletedInitiativeChoices,
    initiativeChoiceGroups,
    listInitiatives,
    type ChoiceGroup,
    type InitiativeChoice,
} from "@/lib/initiatives";
import { setMeetingInitiative } from "@/lib/meetings";
import { ChoiceRow } from "./choice-row";
import { useChoices } from "./use-choices";
import { useImmediateSave } from "./use-immediate-save";

type Choices = { groups: ChoiceGroup[]; deleted: InitiativeChoice[] };

/** Returns the value of the select box for an initiative identifier. The empty value means no initiative. */
function toValue(initiativeId: number | null): string {
    return initiativeId === null ? "" : String(initiativeId);
}

/**
 * The "Initiative" row of the meeting details sidebar. It shows a select box with the
 * initiatives of the meeting's project that are not deleted, in groups, and the initiative
 * that the meeting is assigned to. When the meeting has no project, the select box has only
 * the empty choice and is disabled. If that initiative is deleted, it is the last choice,
 * outside the groups, until the user chooses another one. When the
 * user chooses an initiative, the assignment is saved at once. If the initiatives cannot
 * be loaded, the row shows a message and a Retry button.
 *
 * The choices load again after an initiative is deleted or restored. The row must be in an
 * `DeleteProvider`.
 *
 * `projectId` is the project of the meeting. `initiativeId` is the initiative that the
 * meeting is assigned to when the row opens. After that, the row keeps the choice of the
 * user. Render the row again with a different `key` when the project changes, so that it
 * starts again with the initiative of the new project.
 */
export function MeetingInitiativeSelect({
    meetingId,
    projectId,
    initiativeId,
}: {
    meetingId: number;
    projectId: number | null;
    initiativeId: number | null;
}) {
    const selectId = useId();
    const loadChoices = useCallback(
        () =>
            listInitiatives({ includeDeleted: true }).then(
                (initiatives): Choices => ({
                    groups: initiativeChoiceGroups(initiatives, projectId),
                    deleted: deletedInitiativeChoices(initiatives, projectId),
                }),
            ),
        [projectId],
    );
    const { state: load, retry } = useChoices(loadChoices);
    const { shown, choose } = useImmediateSave({
        initial: toValue(initiativeId),
        save: (value) =>
            setMeetingInitiative(
                meetingId,
                value === "" ? null : Number(value),
            ),
        failureText: "Couldn't assign the initiative. Try again.",
    });

    // A deleted initiative is a choice only while the select box shows it. The select box
    // shows it again if saving another choice fails.
    const shownDeleted =
        load.kind === "loaded"
            ? load.choices.deleted.find((choice) => String(choice.id) === shown)
            : undefined;

    return (
        <ChoiceRow
            label="Initiative"
            selectId={selectId}
            failed={load.kind === "error"}
            errorText="Couldn't load initiatives"
            onRetry={retry}
        >
            <NativeSelect
                // A long name must not make the select wider than the sidebar.
                className="min-w-0"
                id={selectId}
                aria-label="Meeting initiative"
                value={shown}
                // A meeting without a project cannot have an initiative.
                disabled={load.kind === "loading" || projectId === null}
                onChange={(event) => void choose(event.target.value)}
            >
                {/* The empty choice means that the meeting has no initiative. */}
                <NativeSelectOption value="" />
                {load.kind === "loaded" &&
                    load.choices.groups.map((group) => (
                        <NativeSelectOptGroup
                            key={group.label}
                            label={group.label}
                        >
                            {group.choices.map((choice) => (
                                <NativeSelectOption
                                    key={choice.id}
                                    value={String(choice.id)}
                                >
                                    {choice.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelectOptGroup>
                    ))}
                {shownDeleted && (
                    <NativeSelectOption value={String(shownDeleted.id)}>
                        {shownDeleted.label}
                    </NativeSelectOption>
                )}
            </NativeSelect>
        </ChoiceRow>
    );
}
