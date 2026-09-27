import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useFailureToast } from "@/components/use-failure-toast";
import { Button } from "@/components/ui/button";
import {
    createInitiative,
    listInitiatives,
    type Initiative,
    type InitiativeSummary,
} from "@/lib/initiatives";
import {
    buildBoard,
    columnOf,
    emptyBoard,
    replaceCard,
    type Board,
} from "./board";
import { InitiativeSheet } from "./initiative-sheet";
import { RoadmapBoard } from "./roadmap-board";

type BoardState =
    { kind: "loading" } | { kind: "error" } | { kind: "loaded"; board: Board };

/** Returns the saved name of the initiative with the identifier on the board, or `null`. */
function nameOnBoard(board: Board, id: number): string | null {
    const column = columnOf(board, id);
    return column === null
        ? null
        : (board[column].find((card) => card.id === id)?.name ?? null);
}

/**
 * The page that shows the initiatives that are not deleted on a roadmap. A click on a card
 * opens the sheet of its initiative. "New initiative" creates an initiative and opens its
 * sheet.
 */
export function InitiativesPage() {
    const [state, setState] = useState<BoardState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [openId, setOpenId] = useState<number | null>(null);
    // The initiative that "New initiative" created last. Its sheet puts the focus in the
    // name field.
    const [created, setCreated] = useState<Initiative | null>(null);
    const [creating, setCreating] = useState(false);
    const failureToast = useFailureToast();

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

    function openInitiative(id: number) {
        setCreated(null);
        setOpenId(id);
    }

    async function create() {
        setCreating(true);
        try {
            const initiative = await createInitiative();
            failureToast.clear();
            setCreated(initiative);
            setOpenId(initiative.id);
            // Load the board again, so that it shows the new card at the top of Later.
            setAttempt((value) => value + 1);
        } catch {
            failureToast.show("Couldn't create the initiative. Try again.");
        } finally {
            setCreating(false);
        }
    }

    function showSaved(summary: InitiativeSummary) {
        setState((current) =>
            current.kind === "loaded"
                ? { kind: "loaded", board: replaceCard(current.board, summary) }
                : current,
        );
    }

    const openName =
        openId === null
            ? ""
            : ((state.kind === "loaded"
                  ? nameOnBoard(state.board, openId)
                  : null) ?? (created?.id === openId ? created.name : ""));

    return (
        // The header stays in place, and the board gets the remaining height.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
            <PageHeader crumbs={[{ label: "Initiatives" }]}>
                <Button disabled={creating} onClick={create}>
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
            <InitiativeSheet
                id={openId}
                name={openName}
                newInitiative={created}
                onClose={() => setOpenId(null)}
                onSaved={showSaved}
            />
        </div>
    );
}
