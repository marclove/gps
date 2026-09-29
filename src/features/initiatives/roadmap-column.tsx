import { useDroppable } from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
    type SortingStrategy,
} from "@dnd-kit/sortable";
import type { ListData } from "@/components/board/drop-target";
import type { Column, InitiativeSummary } from "@/lib/initiatives";
import { InitiativeCard } from "./initiative-card";

// Done does not take part in sorting, so its cards stay in place while a card is over them.
const keepInPlace: SortingStrategy = () => null;

/**
 * A column of the roadmap. It is a region named after the column, with a heading that shows
 * the title and the number of cards, and a list of cards below the heading. Only the list
 * scrolls. The whole list area, also when it is empty, is a place to drop a card. The column
 * must be in a `DndContext`. Each card shows the name that `projectName` gives for its
 * project. While `loading` is true, the column shows no cards and no text about empty
 * columns.
 */
export function RoadmapColumn({
    column,
    cards,
    projectName,
    onOpen,
    loading = false,
}: {
    column: { id: Column; title: string };
    cards: InitiativeSummary[];
    projectName: (projectId: number) => string;
    onOpen: (id: number) => void;
    loading?: boolean;
}) {
    const items = cards.map((card) => card.id);
    const data: ListData = { column: column.id, items };
    const { setNodeRef } = useDroppable({ id: column.id, data });
    return (
        <section
            aria-label={column.title}
            className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] rounded-xl bg-muted/50"
        >
            <h2 className="flex items-baseline gap-2 px-3 pt-3 pb-2 text-sm font-medium">
                {column.title}
                <span className="text-muted-foreground">{cards.length}</span>
            </h2>
            {/* The padding leaves room for the focus ring of the cards, which the scrolling
                area would cut off. The list area has no padding at its sides, because the
                keyboard moves a card to the next column by the left edges of the cards and
                list areas. */}
            <div className="flex min-h-0 flex-col overflow-y-auto px-2 pt-1 pb-2">
                <div ref={setNodeRef} className="flex-1">
                    {!loading && cards.length === 0 && (
                        <p className="px-1 text-sm text-muted-foreground">
                            No initiatives
                        </p>
                    )}
                    <SortableContext
                        id={column.id}
                        items={items}
                        strategy={
                            column.id === "done"
                                ? keepInPlace
                                : verticalListSortingStrategy
                        }
                    >
                        {cards.length > 0 && (
                            <ul className="flex flex-col gap-2">
                                {cards.map((card) => (
                                    <li key={card.id}>
                                        <InitiativeCard
                                            initiative={card}
                                            projectName={projectName(
                                                card.projectId,
                                            )}
                                            column={column.id}
                                            onOpen={onOpen}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SortableContext>
                </div>
            </div>
        </section>
    );
}
