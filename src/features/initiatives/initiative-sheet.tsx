import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
    getInitiative,
    initiativeDisplayName,
    type Initiative,
    type InitiativeSummary,
} from "@/lib/initiatives";
import {
    FIELD_LABEL_CLASSES,
    InitiativeForm,
    NAME_FIELD_CLASSES,
} from "./initiative-form";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "loaded"; initiative: Initiative };

/**
 * The sheet that edits one initiative. It opens from the right side of the window.
 *
 * - `id` is the identifier of the initiative, or `null` when the sheet is closed.
 * - `name` is the saved name of the initiative. The sheet uses it as its title.
 * - `newInitiative` is an initiative that was just created. If its identifier is `id`, the
 *   sheet shows it without loading it, and the name field gets the focus.
 * - `onClose` is called when the user closes the sheet, also with the "Save" button.
 * - `onSaved` receives the summary of the initiative after each save that succeeds.
 * - `onDelete` is called when the user clicks "Delete", after the changes that were waiting
 *   are saved. It receives the identifier and the saved name of the initiative.
 * - `finalFocus` receives the focus when the sheet closes. If it is not given, the focus
 *   goes back to the element that opened the sheet.
 */
export function InitiativeSheet({
    id,
    name,
    newInitiative = null,
    onClose,
    onSaved,
    onDelete,
    finalFocus,
}: {
    id: number | null;
    name: string;
    newInitiative?: Initiative | null;
    onClose: () => void;
    onSaved: (summary: InitiativeSummary) => void;
    onDelete: (id: number, savedName: string) => Promise<void>;
    finalFocus?: RefObject<HTMLElement | null>;
}) {
    // While the sheet closes, it keeps the last initiative that it showed.
    const [shown, setShown] = useState({ id, name });
    if (id !== null && (id !== shown.id || name !== shown.name)) {
        setShown({ id, name });
    }
    const nameInput = useRef<HTMLInputElement>(null);
    const focusName = newInitiative !== null && newInitiative.id === id;

    return (
        <Sheet
            open={id !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent
                side="right"
                initialFocus={focusName ? nameInput : true}
                finalFocus={finalFocus ?? true}
                className="gap-0 data-[side=right]:w-[min(40rem,100vw)] data-[side=right]:sm:max-w-none"
            >
                <SheetTitle className="sr-only">
                    {initiativeDisplayName(shown.name)}
                </SheetTitle>
                {shown.id !== null && (
                    <SheetBody
                        key={shown.id}
                        id={shown.id}
                        initial={
                            newInitiative?.id === shown.id
                                ? newInitiative
                                : null
                        }
                        nameRef={nameInput}
                        onSaved={onSaved}
                        onDelete={onDelete}
                        onClose={onClose}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
}

/** Loads the initiative and shows its form, or the fields disabled while it loads. */
function SheetBody({
    id,
    initial,
    nameRef,
    onSaved,
    onDelete,
    onClose,
}: {
    id: number;
    initial: Initiative | null;
    nameRef: RefObject<HTMLInputElement | null>;
    onSaved: (summary: InitiativeSummary) => void;
    onDelete: (id: number, savedName: string) => Promise<void>;
    onClose: () => void;
}) {
    const [state, setState] = useState<LoadState>(
        initial ? { kind: "loaded", initiative: initial } : { kind: "loading" },
    );
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        // A new initiative is shown as it was created. A retry loads it again.
        if (initial !== null && attempt === 0) return;
        let current = true;
        getInitiative(id).then(
            (initiative) =>
                current &&
                setState(
                    initiative
                        ? { kind: "loaded", initiative }
                        : { kind: "error" },
                ),
            () => current && setState({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [id, initial, attempt]);

    if (state.kind === "loaded") {
        return (
            <InitiativeForm
                initiative={state.initiative}
                onSaved={onSaved}
                onDelete={(savedName) => onDelete(id, savedName)}
                onSave={onClose}
                nameRef={nameRef}
            />
        );
    }
    if (state.kind === "error") {
        return (
            <div className="flex items-start gap-2 py-4 pr-14 pl-6 text-sm">
                <p>Couldn't load the initiative</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setState({ kind: "loading" });
                        setAttempt((value) => value + 1);
                    }}
                >
                    Retry
                </Button>
            </div>
        );
    }
    return (
        // The same labels and fields as the form, so nothing moves when it loads.
        <div className="grid justify-items-start gap-4 py-4 pr-14 pl-6">
            <div className="grid gap-1.5 justify-self-stretch">
                <span className={FIELD_LABEL_CLASSES}>Name</span>
                <Input
                    aria-label="Initiative name"
                    disabled
                    className={NAME_FIELD_CLASSES}
                />
            </div>
            <div className="grid gap-1.5">
                <span className={FIELD_LABEL_CLASSES}>Role</span>
                <NativeSelect aria-label="RACI role" disabled>
                    <NativeSelectOption value="" />
                </NativeSelect>
            </div>
        </div>
    );
}
