import { useRef, useState } from "react";
import { useFailureToast } from "@/components/use-failure-toast";
import { addMeetingInitiative, removeMeetingInitiative } from "@/lib/meetings";

/** The initiatives of a meeting that the checkboxes show, and the function that changes one. */
export type CoveredInitiatives = {
    /** The identifiers of the initiatives whose checkboxes are checked. */
    checked: ReadonlySet<number>;
    /**
     * The identifiers in `checked`, and the identifiers of the initiatives that the backend
     * links to the meeting or that have a save in progress. A deleted initiative stays a
     * choice while its identifier is in this set.
     */
    linked: ReadonlySet<number>;
    /**
     * Shows the change at once and saves it. `cover` is true to add the initiative to the
     * meeting, and false to remove it.
     */
    toggle: (initiativeId: number, cover: boolean) => Promise<void>;
};

/** What the hook knows about one initiative. */
type Entry = {
    /** The value that the checkbox shows. */
    shown: boolean;
    /** The value that was saved last, with the number of its request. */
    saved: { request: number; value: boolean };
    /** The number of the latest request for this initiative. */
    latest: number;
    /** The numbers of the requests for this initiative that have not ended. */
    pending: Set<number>;
};

function newEntry(value: boolean): Entry {
    return {
        shown: value,
        saved: { request: 0, value },
        latest: 0,
        pending: new Set(),
    };
}

/** The sets of identifiers that the hook returns. */
type Shown = Pick<CoveredInitiatives, "checked" | "linked">;

/** Returns the sets of identifiers that the entries give. */
function sets(entries: Map<number, Entry>): Shown {
    const checked = new Set<number>();
    const linked = new Set<number>();
    for (const [id, entry] of entries) {
        if (entry.shown) checked.add(id);
        if (entry.shown || entry.saved.value || entry.pending.size > 0)
            linked.add(id);
    }
    return { checked, linked };
}

/**
 * Keeps the initiatives that a meeting covers, for checkboxes that save each change at once.
 * `toggle` shows the change at once and adds the initiative to the meeting or removes it. When
 * a save fails, the checkbox goes back to the value that was saved last, and a failure toast
 * tells the user.
 *
 * Each initiative has its own saves. Saves of one initiative can end in a different order than
 * the user clicked. An older save that ends after a newer one does not replace the newer value,
 * and its failure is not reported. When all newer saves fail, the value of the older save is
 * the value in the database, so the checkbox shows it. A save that succeeds closes the failure
 * toast, but only if no request that started later has failed, also for another initiative.
 *
 * `initial` holds the initiatives that the meeting covers when the hook starts. The hook must
 * be in a `FailureToastProvider`.
 */
export function useCoveredInitiatives({
    meetingId,
    initial,
}: {
    meetingId: number;
    initial: number[];
}): CoveredInitiatives {
    // The map is created once and changed in place, so it keeps its identity between renders.
    const [entries] = useState(
        () => new Map(initial.map((id) => [id, newEntry(true)])),
    );
    const [shown, setShown] = useState<Shown>(() => ({
        checked: new Set(initial),
        linked: new Set(initial),
    }));
    // The number of the latest request, for all initiatives.
    const latestRequest = useRef(0);
    // The number of the newest request that failed, for all initiatives.
    const failedRequest = useRef(0);
    const failureToast = useFailureToast();

    function publish() {
        setShown(sets(entries));
    }

    async function toggle(initiativeId: number, cover: boolean) {
        let entry = entries.get(initiativeId);
        if (entry === undefined) {
            entry = newEntry(false);
            entries.set(initiativeId, entry);
        }
        const request = ++latestRequest.current;
        entry.latest = request;
        entry.pending.add(request);
        entry.shown = cover;
        publish();
        try {
            await (cover ? addMeetingInitiative : removeMeetingInitiative)(
                meetingId,
                initiativeId,
            );
            entry.pending.delete(request);
            // An older request that ends after a newer one does not replace the value of the
            // newer one.
            if (request > entry.saved.request) {
                entry.saved = { request, value: cover };
                // When all newer requests have failed, this value is the value in the
                // database, so the checkbox shows it.
                const newerPending = [...entry.pending].some(
                    (other) => other > request,
                );
                if (!newerPending) entry.shown = cover;
            }
            // The toast of a newer request that failed stays open.
            if (request > failedRequest.current) failureToast.clear();
        } catch {
            entry.pending.delete(request);
            // A newer request has already saved the value that the checkbox shows, so this
            // failure has no effect for the user.
            if (request < entry.saved.request) {
                publish();
                return;
            }
            failedRequest.current = Math.max(failedRequest.current, request);
            // An older request that fails does not change the checkbox, because the user
            // has already clicked it again.
            if (request === entry.latest) entry.shown = entry.saved.value;
            failureToast.show(
                cover
                    ? "Couldn't add the initiative. Try again."
                    : "Couldn't remove the initiative. Try again.",
            );
        }
        publish();
    }

    return { ...shown, toggle };
}
