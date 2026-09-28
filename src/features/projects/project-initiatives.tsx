import { PlusIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useDelete } from "@/components/use-delete";
import { Button } from "@/components/ui/button";
import {
    COLUMNS,
    initiativeDisplayName,
    listInitiatives,
    type InitiativeSummary,
} from "@/lib/initiatives";
import { buildBoard } from "@/features/initiatives/board";
import { InitiativeSheet } from "@/features/initiatives/initiative-sheet";
import { useInitiativeSheet } from "@/features/initiatives/use-initiative-sheet";

type ListState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; initiatives: InitiativeSummary[] };

/**
 * Returns the initiatives with the summary in place of the initiative with the same
 * identifier. If the summary is of another project or of a deleted initiative, the result
 * does not have the initiative. If the list does not have the initiative, the result has it
 * too, because a draft created it.
 */
function applySaved(
    initiatives: InitiativeSummary[],
    summary: InitiativeSummary,
    projectId: number,
): InitiativeSummary[] {
    const others = initiatives.filter((item) => item.id !== summary.id);
    if (summary.projectId !== projectId || summary.deletedAt !== null) {
        return others;
    }
    return [...others, summary];
}

/**
 * The list of the initiatives of a project, in the sidebar of the project page. It shows the
 * initiatives that are not deleted in the order of the roadmap: Now, Next, Later, and then
 * Done. Each row shows the name and the column of the initiative. A click on a row opens the
 * sheet of the initiative. "New initiative" opens the sheet for a draft in this project. When
 * the sheet saves, moves to another project, or deletes an initiative, the list changes to
 * match. The list loads again after each delete and restore.
 *
 * When `projectId` is `null`, the project is a draft. Then the list is empty and "New
 * initiative" is disabled, because an initiative needs a saved project.
 */
export function ProjectInitiatives({
    projectId,
}: {
    projectId: number | null;
}) {
    const [list, setList] = useState<ListState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const { version } = useDelete();
    const { openId, openInitiative, openDraft, newButton, sheet } =
        useInitiativeSheet({
            onDeleted: (id) =>
                setList((current) =>
                    current.kind === "loaded"
                        ? {
                              kind: "loaded",
                              initiatives: current.initiatives.filter(
                                  (item) => item.id !== id,
                              ),
                          }
                        : current,
                ),
        });
    const headingId = useId();

    useEffect(() => {
        if (projectId === null) return;
        let current = true;
        listInitiatives({ includeDeleted: false }).then(
            (summaries) =>
                current &&
                setList({
                    kind: "loaded",
                    initiatives: summaries.filter(
                        (summary) => summary.projectId === projectId,
                    ),
                }),
            () => current && setList({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [projectId, attempt, version]);

    function retry() {
        setList({ kind: "loading" });
        setAttempt((value) => value + 1);
    }

    function showSaved(summary: InitiativeSummary) {
        if (projectId === null) return;
        setList((current) =>
            current.kind === "loaded"
                ? {
                      kind: "loaded",
                      initiatives: applySaved(
                          current.initiatives,
                          summary,
                          projectId,
                      ),
                  }
                : current,
        );
    }

    // A draft project has no initiatives, so its list does not load.
    const shown: ListState =
        projectId === null ? { kind: "loaded", initiatives: [] } : list;
    const board =
        shown.kind === "loaded" ? buildBoard(shown.initiatives) : null;
    const rows =
        board === null
            ? []
            : COLUMNS.flatMap((column) =>
                  board[column.id].map((initiative) => ({
                      initiative,
                      columnTitle: column.title,
                  })),
              );
    const openName =
        typeof openId === "number" && shown.kind === "loaded"
            ? (shown.initiatives.find((item) => item.id === openId)?.name ?? "")
            : "";

    return (
        // The heading row stays in place, and the rows scroll.
        <section
            aria-labelledby={headingId}
            className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]"
        >
            <div className="flex items-center justify-between gap-2 px-6 pb-2">
                <h2 id={headingId} className="text-sm font-medium">
                    Initiatives
                </h2>
                <Button
                    ref={newButton}
                    variant="outline"
                    size="sm"
                    disabled={projectId === null}
                    onClick={openDraft}
                >
                    <PlusIcon />
                    New initiative
                </Button>
            </div>
            {/* `pt-1` leaves room for the focus ring of the first row, which the scrolling
                area would cut off. */}
            <div className="min-h-0 overflow-y-auto px-6 pt-1 pb-4 text-sm">
                {shown.kind === "loading" && (
                    <p className="text-muted-foreground">Loading…</p>
                )}
                {shown.kind === "error" && (
                    <div className="flex items-center gap-2">
                        <p>Couldn't load initiatives</p>
                        <Button variant="outline" size="sm" onClick={retry}>
                            Retry
                        </Button>
                    </div>
                )}
                {shown.kind === "loaded" && rows.length === 0 && (
                    <p className="text-muted-foreground">No initiatives</p>
                )}
                {rows.length > 0 && (
                    <ul className="flex flex-col gap-1">
                        {rows.map(({ initiative, columnTitle }) => (
                            <li key={initiative.id}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        openInitiative(initiative.id)
                                    }
                                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                    <span className="min-w-0 truncate font-medium">
                                        {initiativeDisplayName(initiative.name)}
                                    </span>
                                    <span className="shrink-0 text-muted-foreground">
                                        {columnTitle}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <InitiativeSheet
                {...sheet}
                draftProjectId={projectId}
                name={openName}
                onSaved={showSaved}
            />
        </section>
    );
}
