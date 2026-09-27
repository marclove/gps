import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useArchive, type RestoredItem } from "@/components/use-archive";
import { useFailureToast } from "@/components/use-failure-toast";
import { Button } from "@/components/ui/button";
import {
    createInitiative,
    listInitiatives,
    moveInitiative,
    type Column,
    type Initiative,
    type InitiativeSummary,
} from "@/lib/initiatives";
import {
    buildBoard,
    columnOf,
    emptyBoard,
    moveCard,
    removeCard,
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
 * sheet. "Delete" in the sheet deletes the initiative, and the archive toast can restore it.
 * The page loads the board again after each archive and restore, and focuses the card of a
 * restored initiative. A dragged card moves on the board at once. If the backend cannot save
 * the move, the page shows a failure toast and loads the board again when no other move is
 * waiting for the backend, so that the board shows what the backend has.
 */
export function InitiativesPage() {
    const [state, setState] = useState<BoardState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [openId, setOpenId] = useState<number | null>(null);
    // The initiative that "New initiative" created last. Its sheet puts the focus in the
    // name field.
    const [created, setCreated] = useState<Initiative | null>(null);
    const [creating, setCreating] = useState(false);
    // True when the sheet closes because its initiative was deleted. Then the focus goes to
    // "New initiative", because the card that opened the sheet is gone.
    const [focusNewOnClose, setFocusNewOnClose] = useState(false);
    const failureToast = useFailureToast();
    const { archive, version, restored } = useArchive();
    const newButton = useRef<HTMLButtonElement>(null);
    const boardArea = useRef<HTMLDivElement>(null);
    // The restored item that the page already focused, or that was restored before the page
    // opened. The page does not focus it again.
    const handledRestored = useRef<RestoredItem | null>(restored);
    // The number of moves that wait for the backend.
    const pendingMoves = useRef(0);
    // The number of moves that the page started, so that a load can find out that a move
    // started while it waited for the backend.
    const startedMoves = useRef(0);
    // True when the board can differ from the backend, and the page must load it again when
    // no move waits for the backend.
    const reloadAfterMoves = useRef(false);

    useEffect(() => {
        let current = true;
        const movesBefore = startedMoves.current;
        listInitiatives({ includeArchived: false }).then(
            (summaries) => {
                if (!current) return;
                if (startedMoves.current !== movesBefore) {
                    // The list can be older than a move that the board shows. Load it again
                    // after the moves.
                    if (pendingMoves.current > 0) {
                        reloadAfterMoves.current = true;
                    } else {
                        setAttempt((value) => value + 1);
                    }
                    return;
                }
                setState({ kind: "loaded", board: buildBoard(summaries) });
            },
            () => current && setState({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt, version]);

    useEffect(() => {
        // A meeting can have the same identifier as an initiative, so the page reacts only
        // to a restored initiative.
        if (
            restored?.kind !== "initiative" ||
            restored === handledRestored.current ||
            state.kind !== "loaded"
        ) {
            return;
        }
        const card = boardArea.current?.querySelector<HTMLElement>(
            `[data-initiative-id="${restored.id}"]`,
        );
        if (card) {
            card.focus();
            handledRestored.current = restored;
        }
    }, [restored, state]);

    function retry() {
        setState({ kind: "loading" });
        setAttempt((value) => value + 1);
    }

    function openInitiative(id: number) {
        setCreated(null);
        setFocusNewOnClose(false);
        setOpenId(id);
    }

    async function deleteInitiative(id: number, savedName: string) {
        try {
            await archive({ kind: "initiative", id, name: savedName });
        } catch {
            failureToast.show("Couldn't delete the initiative. Try again.");
            return;
        }
        failureToast.clear();
        setFocusNewOnClose(true);
        setOpenId((current) => (current === id ? null : current));
        setState((current) =>
            current.kind === "loaded"
                ? { kind: "loaded", board: removeCard(current.board, id) }
                : current,
        );
    }

    async function create() {
        setCreating(true);
        setFocusNewOnClose(false);
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

    async function move(id: number, to: Column, index: number) {
        setState((current) =>
            current.kind === "loaded"
                ? {
                      kind: "loaded",
                      board: moveCard(current.board, id, to, index),
                  }
                : current,
        );
        pendingMoves.current += 1;
        startedMoves.current += 1;
        try {
            await moveInitiative(id, to, index);
        } catch {
            failureToast.show("Couldn't move the initiative. Try again.");
            // A later move can have succeeded, so the board loads the list from the backend
            // instead of putting back an earlier board.
            reloadAfterMoves.current = true;
        } finally {
            pendingMoves.current -= 1;
            if (pendingMoves.current === 0 && reloadAfterMoves.current) {
                reloadAfterMoves.current = false;
                setAttempt((value) => value + 1);
            }
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
                <Button ref={newButton} disabled={creating} onClick={create}>
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
                <div
                    ref={boardArea}
                    className="grid min-h-0 grid-rows-[minmax(0,1fr)]"
                >
                    <RoadmapBoard
                        board={
                            state.kind === "loaded" ? state.board : emptyBoard()
                        }
                        onOpen={openInitiative}
                        onMove={move}
                        loading={state.kind === "loading"}
                    />
                </div>
            )}
            <InitiativeSheet
                id={openId}
                name={openName}
                newInitiative={created}
                onClose={() => setOpenId(null)}
                onSaved={showSaved}
                onDelete={deleteInitiative}
                finalFocus={focusNewOnClose ? newButton : undefined}
            />
        </div>
    );
}
