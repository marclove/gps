import { ArchiveIcon } from "lucide-react";
import {
    useEffect,
    useRef,
    useState,
    type JSX,
    type ReactNode,
    type RefObject,
} from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useFailureToast } from "@/components/use-failure-toast";
import {
    useArchive,
    type ArchiveKind,
    type RestoredItem,
} from "@/components/use-archive";

type ListState<T> =
    { kind: "loading" } | { kind: "error" } | { kind: "loaded"; items: T[] };

/**
 * Records an archive so the effect that watches the list can move focus once the
 * backend truth catches up, even if another archive changes the list first.
 */
type ArchivedNeighbors = {
    /** The identifier of the archived item. */
    archivedId: number;
    /** The identifiers of every item in the list, in order, as of the archive. */
    orderedIds: number[];
};

/** The properties of `ArchivableList`. */
export type ArchivableListProps<T extends { id: number; name: string }> = {
    /** The kind of the items, which selects the archive commands. */
    kind: ArchiveKind;
    /**
     * Loads the items that are not archived. A new `load` function does not load the
     * list again by itself. The list loads again only after a retry, an archive, or a
     * restore.
     */
    load: () => Promise<T[]>;
    /** The route that opens the item. */
    itemPath: (item: T) => string;
    /** The name to show for a stored name. */
    displayName: (name: string) => string;
    /** Content at the right side of the row, in muted text, such as the date or the role. */
    detail: (item: T) => ReactNode;
    /** The text to show when there are no items. */
    emptyText: string;
    /** The text to show when the items cannot be loaded, next to the Retry button. */
    loadErrorText: string;
    /** The text of the failure toast when an archive fails. */
    archiveFailureMessage: string;
    /** The button that gets focus when the list becomes empty after an archive. */
    fallbackFocusRef: RefObject<HTMLButtonElement | null>;
};

/**
 * Shows a list of items that are not archived. Each row links to its item and has a
 * button that archives the item.
 *
 * The list loads again after each archive or restore. After an archive, focus moves to
 * the archive button of the next item, or to `fallbackFocusRef` if no item is left.
 * After a restore of an item of the same kind, focus moves to the link of that item.
 * Renders the scrolling area of the page, so place it in a grid row that gets the
 * remaining height.
 */
export function ArchivableList<T extends { id: number; name: string }>({
    kind,
    load,
    itemPath,
    displayName,
    detail,
    emptyText,
    loadErrorText,
    archiveFailureMessage,
    fallbackFocusRef,
}: ArchivableListProps<T>): JSX.Element {
    const { archive, version, restored } = useArchive();
    const [list, setList] = useState<ListState<T>>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const failureToast = useFailureToast();
    const itemLinkRefs = useRef(new Map<number, HTMLAnchorElement>());
    const archiveButtonRefs = useRef(new Map<number, HTMLButtonElement>());
    // The most recent archive that is still waiting for the list to catch up, so the
    // effect below can move focus once it does. `null` means nothing is waiting.
    const archivedNeighbors = useRef<ArchivedNeighbors | null>(null);
    // The restored item this list has already moved focus for, so a restore that
    // happened before this list opened, or one this list already reacted to, does not
    // move focus again.
    const handledRestored = useRef<RestoredItem | null>(restored);
    // The identifiers of items with an archive in progress, so a second click on the
    // same row before the first archive finishes has no effect.
    const pendingArchiveIds = useRef(new Set<number>());
    // Holds the latest `load` function, so the list loads again only after a retry,
    // an archive, or a restore, and not each time the caller passes a new function.
    const loadRef = useRef(load);

    useEffect(() => {
        loadRef.current = load;
    }, [load]);

    useEffect(() => {
        let current = true;
        loadRef.current().then(
            (items) => current && setList({ kind: "loaded", items }),
            () => current && setList({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt, version]);

    useEffect(() => {
        const neighbors = archivedNeighbors.current;
        if (!neighbors || list.kind !== "loaded") return;
        archivedNeighbors.current = null;

        // Focus the first surviving item that was after the archived one, in the
        // order the archive saw, or otherwise the nearest surviving one before it.
        // Using that recorded order, rather than the current list's order, is what
        // keeps the target correct when a second archive removed an item in
        // between: an item between the archived one and its recorded neighbor can
        // no longer be there to stand in for it. It does not wait for the archived
        // item itself to disappear from `list` first: the row it is choosing
        // between is the row after or before it, never its own.
        const currentIds = new Set(list.items.map((item) => item.id));
        const archivedIndex = neighbors.orderedIds.indexOf(
            neighbors.archivedId,
        );
        const after =
            archivedIndex === -1
                ? []
                : neighbors.orderedIds.slice(archivedIndex + 1);
        const before =
            archivedIndex === -1
                ? []
                : neighbors.orderedIds.slice(0, archivedIndex).reverse();
        const nextId =
            after.find((id) => currentIds.has(id)) ??
            before.find((id) => currentIds.has(id));

        if (nextId !== undefined) {
            archiveButtonRefs.current.get(nextId)?.focus();
        } else {
            fallbackFocusRef.current?.focus();
        }
    }, [list, fallbackFocusRef]);

    useEffect(() => {
        if (!restored || restored === handledRestored.current) return;
        // A restore of another kind of item is for another list. The identifiers of
        // different kinds can be equal, so the identifier alone does not tell.
        if (restored.kind !== kind) return;
        if (list.kind !== "loaded") return;
        const link = itemLinkRefs.current.get(restored.id);
        if (link) {
            link.focus();
            handledRestored.current = restored;
        }
    }, [restored, list, kind]);

    function retry() {
        setList({ kind: "loading" });
        setAttempt((value) => value + 1);
    }

    async function handleArchive(item: T) {
        // Ignore a second click on the same row while its archive is still in flight,
        // so it cannot run twice.
        if (pendingArchiveIds.current.has(item.id)) return;
        pendingArchiveIds.current.add(item.id);
        try {
            await archive({ kind, id: item.id, name: item.name });
            failureToast.clear();
            // Recorded here, from the list this render sees, rather than computing
            // the focus target itself inside the `setList` updater below: React may
            // call that updater more than once, so it must stay pure, and by the time
            // it runs another archive may already have changed the list, which would
            // make an index computed from a stale snapshot point at the wrong row.
            // The effect that watches `list` picks the actual target once the list
            // catches up, from the always-current list at that later time.
            if (list.kind === "loaded") {
                archivedNeighbors.current = {
                    archivedId: item.id,
                    orderedIds: list.items.map((candidate) => candidate.id),
                };
            }
            setList((current) => {
                if (current.kind !== "loaded") return current;
                if (
                    !current.items.some((candidate) => candidate.id === item.id)
                ) {
                    return current;
                }
                return {
                    kind: "loaded",
                    items: current.items.filter(
                        (candidate) => candidate.id !== item.id,
                    ),
                };
            });
        } catch {
            failureToast.show(archiveFailureMessage);
        } finally {
            pendingArchiveIds.current.delete(item.id);
        }
    }

    return (
        // `pt-2` leaves room for the focus ring of the first item, which the
        // scrolling area would cut off. The title row has 8 pixels less padding,
        // so the list stays at the same position.
        <div className="overflow-y-auto px-6 pt-2 pb-4">
            {list.kind === "loading" && (
                <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {list.kind === "error" && (
                <div className="flex items-center gap-2 text-sm">
                    <p>{loadErrorText}</p>
                    <Button variant="outline" size="sm" onClick={retry}>
                        Retry
                    </Button>
                </div>
            )}
            {list.kind === "loaded" && list.items.length === 0 && (
                <p className="text-sm text-muted-foreground">{emptyText}</p>
            )}
            {list.kind === "loaded" && list.items.length > 0 && (
                <ul className="flex flex-col gap-1">
                    {list.items.map((item) => (
                        <li
                            key={item.id}
                            className="group flex items-center gap-1 rounded-lg hover:bg-muted"
                        >
                            <Link
                                to={itemPath(item)}
                                ref={(link) => {
                                    if (link) {
                                        itemLinkRefs.current.set(item.id, link);
                                    } else {
                                        itemLinkRefs.current.delete(item.id);
                                    }
                                }}
                                className="flex flex-1 items-center justify-between rounded-lg px-3 py-2"
                            >
                                <span className="font-medium">
                                    {displayName(item.name)}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    {detail(item)}
                                </span>
                            </Link>
                            <Button
                                ref={(button) => {
                                    if (button) {
                                        archiveButtonRefs.current.set(
                                            item.id,
                                            button,
                                        );
                                    } else {
                                        archiveButtonRefs.current.delete(
                                            item.id,
                                        );
                                    }
                                }}
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Archive "${displayName(item.name)}"`}
                                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                onClick={() => handleArchive(item)}
                            >
                                <ArchiveIcon />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
