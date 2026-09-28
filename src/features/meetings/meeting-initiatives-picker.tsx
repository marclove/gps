import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    initiativeChoices,
    listInitiatives,
    type InitiativeChoice,
} from "@/lib/initiatives";
import { useChoices } from "./use-choices";
import { useCoveredInitiatives } from "./use-covered-initiatives";

/** Loads all initiatives, also the deleted ones, because a meeting can cover a deleted one. */
function loadInitiatives() {
    return listInitiatives({ includeDeleted: true });
}

/**
 * The "Initiatives" row of the meeting details sidebar. It shows the initiatives that the
 * meeting covers, sorted by the shown name, or "No initiatives". The "Choose" button opens a
 * popover with a checkbox for each initiative of the meeting's project that is not deleted,
 * and for each deleted initiative that the meeting covers. When the user checks or unchecks
 * a checkbox, the change is saved at once. When the removal of a deleted initiative is saved,
 * the popover no longer offers it. When the meeting has no project, the button is disabled.
 * If the initiatives cannot be loaded, the row shows a message and a Retry button.
 *
 * The choices load again after an initiative is deleted or restored. The row must be in a
 * `DeleteProvider` and a `FailureToastProvider`.
 *
 * `projectId` is the project of the meeting. `initiativeIds` are the initiatives that the
 * meeting covers when the row opens. After that, the row keeps the choices of the user.
 * Render the row again with a different `key` when the project changes, so that it starts
 * again with the initiatives of the new project.
 */
export function MeetingInitiativesPicker({
    meetingId,
    projectId,
    initiativeIds,
}: {
    meetingId: number;
    projectId: number | null;
    initiativeIds: number[];
}) {
    const { state: load, retry } = useChoices(loadInitiatives);
    const { checked, linked, toggle } = useCoveredInitiatives({
        meetingId,
        initial: initiativeIds,
    });

    const choices =
        load.kind === "loaded"
            ? initiativeChoices(load.choices, projectId, linked)
            : [];
    const covered = choices.filter((choice) => checked.has(choice.id));
    // While the initiatives load, the names of the covered initiatives are not known yet.
    const coversNone =
        load.kind === "loaded" ? covered.length === 0 : checked.size === 0;

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-sm font-medium">
                    Initiatives
                </span>
                {load.kind === "error" ? (
                    <div className="flex items-center gap-2 text-sm">
                        <p>Couldn't load initiatives</p>
                        <Button variant="outline" size="sm" onClick={retry}>
                            Retry
                        </Button>
                    </div>
                ) : (
                    <Popover>
                        <PopoverTrigger
                            render={<Button variant="outline" size="sm" />}
                            aria-label="Choose initiatives"
                            // A meeting without a project cannot cover initiatives.
                            disabled={
                                projectId === null || load.kind === "loading"
                            }
                        >
                            Choose
                        </PopoverTrigger>
                        <PopoverContent
                            aria-label="Choose initiatives"
                            align="end"
                        >
                            <InitiativeCheckboxes
                                choices={choices}
                                checked={checked}
                                toggle={toggle}
                            />
                        </PopoverContent>
                    </Popover>
                )}
            </div>
            {load.kind !== "error" &&
                (coversNone ? (
                    <p className="text-sm text-muted-foreground">
                        No initiatives
                    </p>
                ) : (
                    covered.length > 0 && (
                        <ul
                            aria-label="Meeting initiatives"
                            className="flex flex-col gap-1 text-sm"
                        >
                            {covered.map((choice) => (
                                <li
                                    key={choice.id}
                                    // A long name wraps and does not make the sidebar wider.
                                    className="min-w-0 break-words"
                                >
                                    {choice.label}
                                </li>
                            ))}
                        </ul>
                    )
                ))}
        </div>
    );
}

/** The content of the popover: one labeled checkbox for each choice, in a list that scrolls. */
function InitiativeCheckboxes({
    choices,
    checked,
    toggle,
}: {
    choices: InitiativeChoice[];
    checked: ReadonlySet<number>;
    toggle: (initiativeId: number, cover: boolean) => Promise<void>;
}) {
    if (choices.length === 0) return <p>This project has no initiatives.</p>;
    return (
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {choices.map((choice) => {
                const isChecked = checked.has(choice.id);
                return (
                    <label
                        key={choice.id}
                        className="flex min-w-0 items-start gap-2 px-1 py-1 break-words"
                    >
                        <Checkbox
                            className="mt-0.5"
                            checked={isChecked}
                            // The backend refuses to add a deleted initiative, so the user
                            // cannot check one again after unchecking it.
                            disabled={choice.deleted && !isChecked}
                            onCheckedChange={(value) =>
                                void toggle(choice.id, value)
                            }
                        />
                        <span className="min-w-0">{choice.label}</span>
                    </label>
                );
            })}
        </div>
    );
}
