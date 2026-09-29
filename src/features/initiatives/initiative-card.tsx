import { CheckIcon } from "lucide-react";
import { BoardCardCopy } from "@/components/board/board-card";
import { cn } from "@/lib/utils";
import {
    initiativeDisplayName,
    raciRoleLabel,
    type Column,
    type InitiativeSummary,
    type RaciRole,
} from "@/lib/initiatives";

/**
 * The colors of the role pill, from the role that needs the most attention to the least:
 * red for responsible, orange for accountable, and yellow for consulted. Informed needs
 * the least attention, so its pill is gray.
 */
const roleClassNames: Record<RaciRole, string> = {
    responsible:
        "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
    accountable:
        "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300",
    consulted:
        "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300",
    informed: "text-muted-foreground",
};

/**
 * The content of a card on the roadmap: the name of the initiative, the name of its project
 * `projectName` below it, and the role of the user when there is one. If `done` is true, the
 * content also shows a check mark, and the name is muted.
 */
export function InitiativeCardContent({
    initiative,
    projectName,
    done,
}: {
    initiative: InitiativeSummary;
    projectName: string;
    done: boolean;
}) {
    return (
        <>
            <span
                className={cn(
                    "flex w-full items-start gap-1.5",
                    done && "text-muted-foreground",
                )}
            >
                {done && (
                    <CheckIcon
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                    />
                )}
                <span className="min-w-0 font-medium break-words">
                    {initiativeDisplayName(initiative.name)}
                </span>
            </span>
            <span className="min-w-0 text-xs break-words text-muted-foreground">
                {projectName}
            </span>
            {initiative.raciRole !== null && (
                <span
                    className={cn(
                        "rounded-full border px-2 py-0.5 text-xs",
                        roleClassNames[initiative.raciRole],
                    )}
                >
                    {raciRoleLabel(initiative.raciRole)}
                </span>
            )}
        </>
    );
}

/**
 * A copy of a card that the board shows below the pointer while the card is dragged. It
 * looks like the card in the column `column`, with the name of its project `projectName`.
 * Screen readers and the keyboard ignore it, because the card itself stays in its list.
 */
export function InitiativeCardCopy({
    initiative,
    projectName,
    column,
}: {
    initiative: InitiativeSummary;
    projectName: string;
    column: Column;
}) {
    return (
        <BoardCardCopy>
            <InitiativeCardContent
                initiative={initiative}
                projectName={projectName}
                done={column === "done"}
            />
        </BoardCardCopy>
    );
}
