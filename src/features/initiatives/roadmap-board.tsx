import { COLUMNS } from "@/lib/initiatives";
import type { Board } from "./board";
import { RoadmapColumn } from "./roadmap-column";

/**
 * The roadmap: four columns of equal width, Now, Next, Later, and Done, from left to right.
 * The board fills the height that it gets, and each column scrolls its own list of cards.
 * While `loading` is true, the columns show their headings and no cards.
 */
export function RoadmapBoard({
    board,
    onOpen,
    loading = false,
}: {
    board: Board;
    onOpen: (id: number) => void;
    loading?: boolean;
}) {
    return (
        <div className="grid min-h-0 grid-cols-4 grid-rows-[minmax(0,1fr)] gap-4 px-6 pb-4">
            {COLUMNS.map((column) => (
                <RoadmapColumn
                    key={column.id}
                    column={column}
                    cards={board[column.id]}
                    onOpen={onOpen}
                    loading={loading}
                />
            ))}
        </div>
    );
}
