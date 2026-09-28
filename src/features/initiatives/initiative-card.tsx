import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    initiativeDisplayName,
    raciRoleLabel,
    type Column,
    type InitiativeSummary,
    type RaciRole,
} from "@/lib/initiatives";

const cardClassName =
    "flex w-full flex-col items-start gap-1.5 rounded-lg border bg-card px-3 py-2 text-left text-sm shadow-xs";

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
 * The text of a card: the check mark in Done, the name, the name of the project, and the role
 * of the user.
 */
function CardContent({
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
            <span className="flex w-full items-start gap-1.5">
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
 * A card on the roadmap. It is a button as wide as its column that shows the name of the
 * initiative, the name of its project `projectName` below it, and the role of the user when
 * there is one. A card in Done also shows a check
 * mark, and its text is muted. A click on the card, or the Enter key, calls `onOpen` with the
 * identifier of the initiative. The user drags the card with the pointer, or picks it up with
 * Space. While the card is dragged, it stays in its list as a faded placeholder, and the board
 * shows `InitiativeCardCopy` below the pointer. The card must be in a `SortableContext` of the
 * column `column`. The button has the identifier in its `data-initiative-id` attribute, so
 * that the page can find the card and focus it.
 */
export function InitiativeCard({
    initiative,
    projectName,
    column,
    onOpen,
}: {
    initiative: InitiativeSummary;
    projectName: string;
    column: Column;
    onOpen: (id: number) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: initiative.id, data: { column } });
    const done = column === "done";
    return (
        <button
            ref={setNodeRef}
            type="button"
            data-initiative-id={initiative.id}
            onClick={() => onOpen(initiative.id)}
            {...attributes}
            {...listeners}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={cn(
                cardClassName,
                "transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                done && "text-muted-foreground",
                isDragging && "opacity-40",
            )}
        >
            <CardContent
                initiative={initiative}
                projectName={projectName}
                done={done}
            />
        </button>
    );
}

/**
 * A copy of a card that the board shows below the pointer while the card is dragged. It
 * looks like the card in the column `column`, with the name of its project `projectName`. Screen readers and the keyboard ignore it,
 * because the card itself stays in its list.
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
    const done = column === "done";
    return (
        <div
            aria-hidden="true"
            className={cn(
                cardClassName,
                "h-full cursor-grabbing shadow-md",
                done && "text-muted-foreground",
            )}
        >
            <CardContent
                initiative={initiative}
                projectName={projectName}
                done={done}
            />
        </div>
    );
}
