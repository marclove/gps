import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const cardClassName =
    "flex w-full flex-col items-start gap-1.5 rounded-lg border bg-card px-3 py-2 text-left text-sm shadow-xs";

/**
 * A card on a board. The card is a container as wide as its column, with the identifier `id`
 * in its `data-card-id` attribute, so that a page can find the card. The container holds an
 * open button, which covers the whole card and shows `children`, and then the buttons
 * `actions`, if there are any, above the top right corner of the open button. The accessible
 * name of the open button is the text of `children`. A click on the open button, or the Enter
 * key, calls `onOpen` with `id`.
 *
 * If `draggable` is true, the user drags the card with the pointer from the open button, or
 * picks it up with Space on the open button. A press on an action never starts a drag. While
 * the card is dragged, it stays in its list as a faded placeholder, and the board shows a
 * copy of the card below the pointer. The card must be in a `SortableContext`.
 */
export function BoardCard({
    id,
    draggable,
    onOpen,
    actions,
    children,
}: {
    id: number;
    draggable: boolean;
    onOpen: (id: number) => void;
    actions?: ReactNode;
    children: ReactNode;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled: !draggable });
    return (
        <div
            ref={setNodeRef}
            data-card-id={id}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={cn("relative", isDragging && "opacity-40")}
        >
            <button
                ref={setActivatorNodeRef}
                type="button"
                onClick={() => onOpen(id)}
                // A card that cannot be dragged is a plain button, so screen readers do not
                // call it sortable or disabled.
                {...(draggable ? attributes : {})}
                {...listeners}
                className={cn(
                    cardClassName,
                    "transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
            >
                {children}
            </button>
            {actions && (
                <div className="absolute top-1.5 right-1.5 flex gap-1">
                    {actions}
                </div>
            )}
        </div>
    );
}

/**
 * A copy of a card that the board shows below the pointer while the card is dragged. It looks
 * like a card and shows `children`. Screen readers and the keyboard ignore it, because the card
 * itself stays in its list.
 */
export function BoardCardCopy({ children }: { children: ReactNode }) {
    return (
        <div
            aria-hidden="true"
            className={cn(cardClassName, "h-full cursor-grabbing shadow-md")}
        >
            {children}
        </div>
    );
}
