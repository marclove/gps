import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { listInitiatives } from "@/lib/initiatives";
import { buildBoard, emptyBoard, type Board } from "./board";
import { RoadmapBoard } from "./roadmap-board";

type BoardState =
    { kind: "loading" } | { kind: "error" } | { kind: "loaded"; board: Board };

/** The page that shows the initiatives that are not deleted on a roadmap. */
export function InitiativesPage() {
    const [state, setState] = useState<BoardState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let current = true;
        listInitiatives({ includeArchived: false }).then(
            (summaries) =>
                current &&
                setState({ kind: "loaded", board: buildBoard(summaries) }),
            () => current && setState({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt]);

    function retry() {
        setState({ kind: "loading" });
        setAttempt((value) => value + 1);
    }

    // The sheet that shows an initiative is not available yet, so a card does nothing.
    function openInitiative() {}

    return (
        // The header stays in place, and the board gets the remaining height.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
            <PageHeader crumbs={[{ label: "Initiatives" }]}>
                <Button>
                    <PlusIcon />
                    New initiative
                </Button>
            </PageHeader>
            {state.kind === "error" ? (
                <div className="flex items-start gap-2 px-6 text-sm">
                    <p>Couldn't load initiatives</p>
                    <Button variant="outline" size="sm" onClick={retry}>
                        Retry
                    </Button>
                </div>
            ) : (
                <RoadmapBoard
                    board={state.kind === "loaded" ? state.board : emptyBoard()}
                    onOpen={openInitiative}
                    loading={state.kind === "loading"}
                />
            )}
        </div>
    );
}
