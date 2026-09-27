import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    NativeSelect,
    NativeSelectOptGroup,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { useArchive } from "@/components/use-archive";
import { useFailureToast } from "@/components/use-failure-toast";
import {
    deletedInitiativeChoices,
    initiativeChoiceGroups,
    listInitiatives,
    type ChoiceGroup,
    type InitiativeChoice,
} from "@/lib/initiatives";
import { setMeetingInitiative } from "@/lib/meetings";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; groups: ChoiceGroup[]; deleted: InitiativeChoice[] };

/** Returns the value of the select box for an initiative identifier. The empty value means no initiative. */
function toValue(initiativeId: number | null): string {
    return initiativeId === null ? "" : String(initiativeId);
}

/**
 * The "Initiative" row of the meeting details sidebar. It shows a select box with the
 * initiatives that are not deleted, in groups, and the initiative that the meeting is
 * assigned to. If that initiative is deleted, it is the last choice, outside the groups,
 * until the user chooses another one. When the
 * user chooses an initiative, the assignment is saved at once. If the initiatives cannot
 * be loaded, the row shows a message and a Retry button.
 *
 * The choices load again after an initiative is deleted or restored. The row must be in an
 * `ArchiveProvider`.
 *
 * `initiativeId` is the initiative that the meeting is assigned to when the row opens.
 * After that, the row keeps the choice of the user.
 */
export function MeetingInitiativeSelect({
    meetingId,
    initiativeId,
}: {
    meetingId: number;
    initiativeId: number | null;
}) {
    const selectId = useId();
    const [load, setLoad] = useState<LoadState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [shown, setShown] = useState(toValue(initiativeId));
    // The value that was saved last, with the number of its request.
    const saved = useRef({ request: 0, value: toValue(initiativeId) });
    // The number of the latest request that saves a choice.
    const latestRequest = useRef(0);
    // The number of the newest request that failed.
    const failedRequest = useRef(0);
    // The numbers of the requests that have not ended.
    const pendingRequests = useRef(new Set<number>());
    const failureToast = useFailureToast();
    // Counts deletes and restores, so the choices load again when an initiative is deleted
    // or restored, for example with Undo while this row is open.
    const { version: archiveVersion } = useArchive();

    useEffect(() => {
        let current = true;
        listInitiatives({ includeArchived: true }).then(
            (initiatives) =>
                current &&
                setLoad({
                    kind: "loaded",
                    groups: initiativeChoiceGroups(initiatives),
                    deleted: deletedInitiativeChoices(initiatives),
                }),
            () => current && setLoad({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt, archiveVersion]);

    async function assign(value: string) {
        const request = ++latestRequest.current;
        pendingRequests.current.add(request);
        setShown(value);
        try {
            await setMeetingInitiative(
                meetingId,
                value === "" ? null : Number(value),
            );
            pendingRequests.current.delete(request);
            // An older request that ends after a newer one does not replace the value
            // of the newer one.
            if (request > saved.current.request) {
                saved.current = { request, value };
                // When all newer requests have failed, this value is the value in the
                // database, so the select box shows it.
                const newerPending = [...pendingRequests.current].some(
                    (other) => other > request,
                );
                if (!newerPending) setShown(value);
            }
            // The toast of a newer request that failed stays open.
            if (request > failedRequest.current) failureToast.clear();
        } catch {
            pendingRequests.current.delete(request);
            // A newer request has already saved the choice that the select box shows, so
            // this failure has no effect for the user.
            if (request < saved.current.request) return;
            failedRequest.current = Math.max(failedRequest.current, request);
            // An older request that fails does not change the choice, because the user
            // has already made a newer choice.
            if (request === latestRequest.current)
                setShown(saved.current.value);
            failureToast.show("Couldn't assign the initiative. Try again.");
        }
    }

    // A deleted initiative is a choice only while the select box shows it. The select box
    // shows it again if saving another choice fails.
    const shownDeleted =
        load.kind === "loaded"
            ? load.deleted.find((choice) => String(choice.id) === shown)
            : undefined;

    return (
        <div className="flex items-center justify-between gap-2">
            {load.kind === "error" ? (
                <span className="shrink-0 text-sm font-medium">Initiative</span>
            ) : (
                <label
                    htmlFor={selectId}
                    className="shrink-0 text-sm font-medium"
                >
                    Initiative
                </label>
            )}
            {load.kind === "error" ? (
                <div className="flex items-center gap-2 text-sm">
                    <p>Couldn't load initiatives</p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setLoad({ kind: "loading" });
                            setAttempt((value) => value + 1);
                        }}
                    >
                        Retry
                    </Button>
                </div>
            ) : (
                <NativeSelect
                    // A long name must not make the select wider than the sidebar.
                    className="min-w-0"
                    id={selectId}
                    aria-label="Meeting initiative"
                    value={shown}
                    disabled={load.kind === "loading"}
                    onChange={(event) => void assign(event.target.value)}
                >
                    {/* The empty choice means that the meeting has no initiative. */}
                    <NativeSelectOption value="" />
                    {load.kind === "loaded" &&
                        load.groups.map((group) => (
                            <NativeSelectOptGroup
                                key={group.label}
                                label={group.label}
                            >
                                {group.choices.map((choice) => (
                                    <NativeSelectOption
                                        key={choice.id}
                                        value={String(choice.id)}
                                    >
                                        {choice.label}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelectOptGroup>
                        ))}
                    {shownDeleted && (
                        <NativeSelectOption value={String(shownDeleted.id)}>
                            {shownDeleted.label}
                        </NativeSelectOption>
                    )}
                </NativeSelect>
            )}
        </div>
    );
}
