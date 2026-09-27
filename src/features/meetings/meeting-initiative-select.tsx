import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    NativeSelect,
    NativeSelectOptGroup,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { useFailureToast } from "@/components/use-failure-toast";
import {
    initiativeChoiceGroups,
    listInitiatives,
    type ChoiceGroup,
} from "@/lib/initiatives";
import { setMeetingInitiative } from "@/lib/meetings";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; groups: ChoiceGroup[] };

/** Returns the value of the select box for an initiative identifier. The empty value means no initiative. */
function toValue(initiativeId: number | null): string {
    return initiativeId === null ? "" : String(initiativeId);
}

/**
 * The "Initiative" row of the meeting details sidebar. It shows a select box with the
 * initiatives in groups, and the initiative that the meeting is assigned to. When the
 * user chooses an initiative, the assignment is saved at once. If the initiatives cannot
 * be loaded, the row shows a message and a Retry button.
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

    useEffect(() => {
        let current = true;
        listInitiatives({ includeArchived: true }).then(
            (initiatives) =>
                current &&
                setLoad({
                    kind: "loaded",
                    groups: initiativeChoiceGroups(initiatives),
                }),
            () => current && setLoad({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [attempt]);

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

    return (
        <div className="flex items-center justify-between gap-2">
            {load.kind === "error" ? (
                <span className="text-sm font-medium">Initiative</span>
            ) : (
                <label htmlFor={selectId} className="text-sm font-medium">
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
                </NativeSelect>
            )}
        </div>
    );
}
