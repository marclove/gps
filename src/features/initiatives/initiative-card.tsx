import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    initiativeDisplayName,
    raciRoleLabel,
    type InitiativeSummary,
} from "@/lib/initiatives";

/**
 * A card on the roadmap. It is a button as wide as its column that shows the name of the
 * initiative, and the role of the user when there is one. A card in Done also shows a check
 * mark, and its text is muted. A click on the card, or the Enter key, calls `onOpen` with the
 * identifier of the initiative. The button has the identifier in its `data-initiative-id`
 * attribute, so that the page can find the card and focus it.
 */
export function InitiativeCard({
    initiative,
    done,
    onOpen,
}: {
    initiative: InitiativeSummary;
    done: boolean;
    onOpen: (id: number) => void;
}) {
    return (
        <button
            type="button"
            data-initiative-id={initiative.id}
            onClick={() => onOpen(initiative.id)}
            className={cn(
                "flex w-full flex-col items-start gap-1.5 rounded-lg border bg-card px-3 py-2 text-left text-sm shadow-xs transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                done && "text-muted-foreground",
            )}
        >
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
            {initiative.raciRole !== null && (
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    {raciRoleLabel(initiative.raciRole)}
                </span>
            )}
        </button>
    );
}
