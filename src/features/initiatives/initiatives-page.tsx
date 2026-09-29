import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { columnOf, moveCard } from "@/components/board/cards";
import { PageHeader } from "@/components/page-header";
import { useDelete, type RestoredItem } from "@/components/use-delete";
import { useFailureToast } from "@/components/use-failure-toast";
import { Button } from "@/components/ui/button";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import {
    listInitiatives,
    moveInitiative,
    type Column,
    type InitiativeSummary,
} from "@/lib/initiatives";
import {
    listProjects,
    projectDisplayName,
    sortProjects,
    type Project,
} from "@/lib/projects";
import {
    addCard,
    buildBoard,
    emptyBoard,
    filterBoard,
    fullIndex,
    removeCard,
    replaceCard,
    type Board,
} from "./board";
import { InitiativeSheet } from "./initiative-sheet";
import { RoadmapBoard } from "./roadmap-board";
import { useInitiativeSheet } from "./use-initiative-sheet";

type BoardState =
    | { kind: "loading" }
    /** `failed` is the list that could not be loaded. */
    | { kind: "error"; failed: "initiatives" | "projects" }
    | { kind: "loaded"; board: Board; projects: Project[] };

/** Returns the saved name of the initiative with the identifier on the board, or `null`. */
function nameOnBoard(board: Board, id: number): string | null {
    const column = columnOf(board, id);
    return column === null
        ? null
        : (board[column].find((card) => card.id === id)?.name ?? null);
}

/**
 * The page that shows the initiatives that are not deleted on a roadmap. A click on a card
 * opens the sheet of its initiative. "New initiative" opens the sheet for a draft, which is
 * saved only after the user changes it. When the draft is saved, its card appears at the top
 * of Later, and the sheet goes on to edit the new initiative. "Delete" in the sheet deletes
 * the initiative, and the delete toast can restore it. The page loads the board again after
 * each delete and restore, and focuses the card of a restored initiative. A dragged card
 * moves on the board at once. If the backend cannot save the move, the page shows a failure
 * toast and loads the board again when no other move is waiting for the backend, so that the
 * board shows what the backend has.
 *
 * Each card shows the name of its project. The "Project" select box in the header filters the
 * roadmap to the cards of one project. The filter is state of the page, so it starts on "All
 * projects" each time the page opens. A card dropped on a filtered roadmap lands next to the
 * cards that the user sees, and the cards of other projects keep their places. A draft starts
 * in the project of the filter. A card whose initiative moves to another project leaves a
 * filtered roadmap.
 */
export function InitiativesPage() {
    const [state, setState] = useState<BoardState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    // The project whose cards the roadmap shows, or `null` for all cards.
    const [filter, setFilter] = useState<number | null>(null);
    const failureToast = useFailureToast();
    const { version, restored } = useDelete();
    const { openId, openInitiative, openDraft, newButton, sheet } =
        useInitiativeSheet({
            onDeleted: (id) =>
                setState((current) =>
                    current.kind === "loaded"
                        ? { ...current, board: removeCard(current.board, id) }
                        : current,
                ),
        });
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
        void Promise.allSettled([
            listInitiatives({ includeDeleted: false }),
            listProjects({ includeDeleted: false }),
        ]).then(([summaries, projects]) => {
            if (!current) return;
            if (summaries.status === "rejected") {
                setState({ kind: "error", failed: "initiatives" });
                return;
            }
            if (projects.status === "rejected") {
                setState({ kind: "error", failed: "projects" });
                return;
            }
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
            setState({
                kind: "loaded",
                board: buildBoard(summaries.value),
                projects: sortProjects(projects.value),
            });
        });
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
        // The first button of a card is its open button.
        const card = boardArea.current?.querySelector<HTMLElement>(
            `[data-card-id="${restored.id}"] button`,
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

    async function move(id: number, to: Column, shownIndex: number) {
        if (state.kind !== "loaded") return;
        // The board gives the place among the shown cards. The backend and the board of the
        // page count all cards of the column. The index has no effect in Done.
        const index =
            to === "done"
                ? shownIndex
                : fullIndex(state.board[to], shownBoard[to], id, shownIndex);
        setState((current) =>
            current.kind === "loaded"
                ? { ...current, board: moveCard(current.board, id, to, index) }
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
        setState((current) => {
            if (current.kind !== "loaded") return current;
            // A summary of an initiative that is not on the board and not deleted comes from
            // a draft that was just created, also after its sheet closed.
            const board =
                columnOf(current.board, summary.id) === null &&
                summary.deletedAt === null
                    ? addCard(current.board, summary)
                    : replaceCard(current.board, summary);
            return { ...current, board };
        });
    }

    const shownBoard =
        state.kind === "loaded"
            ? filterBoard(state.board, filter)
            : emptyBoard();
    const projectNames = new Map(
        state.kind === "loaded"
            ? state.projects.map((project) => [
                  project.id,
                  projectDisplayName(project.name),
              ])
            : [],
    );

    const openName =
        typeof openId === "number" && state.kind === "loaded"
            ? (nameOnBoard(state.board, openId) ?? "")
            : "";

    return (
        // The header stays in place, and the board gets the remaining height.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
            <PageHeader crumbs={[{ label: "Initiatives" }]}>
                <NativeSelect
                    aria-label="Project"
                    value={filter === null ? "" : String(filter)}
                    onChange={(event) =>
                        setFilter(
                            event.target.value === ""
                                ? null
                                : Number(event.target.value),
                        )
                    }
                >
                    <NativeSelectOption value="">
                        All projects
                    </NativeSelectOption>
                    {state.kind === "loaded" &&
                        state.projects.map((project) => (
                            <NativeSelectOption
                                key={project.id}
                                value={String(project.id)}
                            >
                                {projectDisplayName(project.name)}
                            </NativeSelectOption>
                        ))}
                </NativeSelect>
                <Button ref={newButton} onClick={openDraft}>
                    <PlusIcon />
                    New initiative
                </Button>
            </PageHeader>
            {state.kind === "error" ? (
                <div className="flex items-start gap-2 px-6 text-sm">
                    <p>Couldn't load {state.failed}</p>
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
                        board={shownBoard}
                        projectName={(projectId) =>
                            projectNames.get(projectId) ?? ""
                        }
                        onOpen={openInitiative}
                        onMove={move}
                        loading={state.kind === "loading"}
                    />
                </div>
            )}
            <InitiativeSheet
                {...sheet}
                draftProjectId={filter}
                name={openName}
                onSaved={showSaved}
            />
        </div>
    );
}
