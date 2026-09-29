import { useDroppable } from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
    type SortingStrategy,
} from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BoardCard } from "./board-card";
import type { BoardColumnDef, ListData } from "./drop-target";

// In a column that the user does not order, the cards stay in place while a card is over them.
const keepInPlace: SortingStrategy = () => null;

/**
 * A column of a board. It is a region named after the title of `column`, with a heading that
 * shows the title and the number of cards, the `header` of the column if it has one, and a
 * list of the cards `cards` below. Only the list scrolls. The whole list area, also when it is
 * empty, is a place to drop a card. An empty column shows the `emptyText` of the column. The
 * column must be in a `DndContext`.
 *
 * Each card shows `renderContent` in its open button and `renderActions` beside it. A click on
 * a card calls `onOpen` with its identifier. While `loading` is true, the column shows no cards
 * and no text about an empty column.
 */
export function BoardColumn<C extends { id: number }, K extends string>({
    column,
    cards,
    renderContent,
    renderActions,
    onOpen,
    loading,
}: {
    column: BoardColumnDef<C, K>;
    cards: C[];
    renderContent: (card: C, column: K) => ReactNode;
    renderActions?: (card: C, column: K) => ReactNode;
    onOpen: (id: number) => void;
    loading: boolean;
}) {
    const items = cards.map((card) => card.id);
    const data: ListData = { column: column.id, items };
    const { setNodeRef } = useDroppable({ id: column.id, data });
    return (
        <section
            aria-label={column.title}
            className={cn(
                "grid min-h-0 rounded-xl bg-muted/50",
                column.header === undefined
                    ? "grid-rows-[auto_minmax(0,1fr)]"
                    : "grid-rows-[auto_auto_minmax(0,1fr)]",
            )}
        >
            <h2 className="flex items-baseline gap-2 px-3 pt-3 pb-2 text-sm font-medium">
                {column.title}
                <span className="text-muted-foreground">{cards.length}</span>
            </h2>
            {column.header !== undefined && (
                <div className="px-2 pb-1">{column.header}</div>
            )}
            {/* The padding leaves room for the focus ring of the cards, which the scrolling
                area would cut off. The list area has no padding at its sides, because the
                keyboard moves a card to the next column by the left edges of the cards and
                list areas. */}
            <div className="flex min-h-0 flex-col overflow-y-auto px-2 pt-1 pb-2">
                <div ref={setNodeRef} className="flex-1">
                    {!loading && cards.length === 0 && (
                        <p className="px-1 text-sm text-muted-foreground">
                            {column.emptyText}
                        </p>
                    )}
                    <SortableContext
                        id={column.id}
                        items={items}
                        strategy={
                            column.ordered
                                ? verticalListSortingStrategy
                                : keepInPlace
                        }
                    >
                        {cards.length > 0 && (
                            <ul className="flex flex-col gap-2">
                                {cards.map((card) => (
                                    <li key={card.id}>
                                        <BoardCard
                                            id={card.id}
                                            draggable={column.draggable}
                                            onOpen={onOpen}
                                            actions={renderActions?.(
                                                card,
                                                column.id,
                                            )}
                                        >
                                            {renderContent(card, column.id)}
                                        </BoardCard>
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
