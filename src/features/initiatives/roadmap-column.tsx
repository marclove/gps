import type { Column, InitiativeSummary } from "@/lib/initiatives";
import { InitiativeCard } from "./initiative-card";

/**
 * A column of the roadmap. It is a region named after the column, with a heading that shows
 * the title and the number of cards, and a list of cards below the heading. Only the list
 * scrolls. While `loading` is true, the column shows no cards and no text about empty columns.
 */
export function RoadmapColumn({
    column,
    cards,
    onOpen,
    loading = false,
}: {
    column: { id: Column; title: string };
    cards: InitiativeSummary[];
    onOpen: (id: number) => void;
    loading?: boolean;
}) {
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
                area would cut off. */}
            <div className="min-h-0 overflow-y-auto px-2 pt-1 pb-2">
                {!loading && cards.length === 0 && (
                    <p className="px-1 text-sm text-muted-foreground">
                        No initiatives
                    </p>
                )}
                {cards.length > 0 && (
                    <ul className="flex flex-col gap-2">
                        {cards.map((card) => (
                            <li key={card.id}>
                                <InitiativeCard
                                    initiative={card}
                                    done={column.id === "done"}
                                    onOpen={onOpen}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
