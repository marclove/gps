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
    NAME_FIELD_CLASSES,
} from "@/components/form-field-classes";
import { InitiativeForm } from "./initiative-form";

/** What the sheet shows: the identifier of an initiative, or "new" for a draft. */
export type SheetTarget = number | "new";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    // `initiative` is `null` for a draft.
    | { kind: "loaded"; initiative: Initiative | null };

/**
 * The sheet that edits one initiative. It opens from the right side of the window.
 *
 * - `id` is the identifier of the initiative, "new" for a draft, or `null` when the sheet is
 *   closed. A draft is a new initiative that is not saved yet. For a draft, the name field
 *   gets the focus.
 * - `draftProjectId` is the project that a draft starts in, or `null` to let the form choose.
 * - `name` is the saved name of the initiative. The sheet uses it as its title.
 * - `onClose` is called when the user closes the sheet, also with the "Save" button.
 * - `onSaved` receives the summary of the initiative after each save that succeeds. For a
 *   draft, the first save creates the initiative.
 * - `onCreated` receives the identifier of the initiative that a draft created, while the
 *   draft is shown. The caller then gives this identifier as `id`, and the sheet goes on
 *   editing the initiative in the same form.
 * - `onDelete` is called when the user clicks "Delete", after the changes that were waiting
 *   are saved. It receives the identifier and the saved name of the initiative.
 * - `finalFocus` receives the focus when the sheet closes. If it is not given, the focus
 *   goes back to the element that opened the sheet.
 * - `onOpenTask` is called when the user clicks a row of the list "Tasks" of a saved
 *   initiative, after the changes that were waiting are saved. It receives the identifier and
 *   the title of the task. The sheet shows the list only when `onOpenTask` is given.
 */
export function InitiativeSheet({
    id,
    draftProjectId,
    name,
    onClose,
    onSaved,
    onCreated,
    onDelete,
    finalFocus,
    onOpenTask,
}: {
    id: SheetTarget | null;
    draftProjectId: number | null;
    name: string;
    onClose: () => void;
    onSaved: (summary: InitiativeSummary) => void;
    onCreated: (id: number) => void;
    onDelete: (id: number, savedName: string) => Promise<void>;
    finalFocus?: RefObject<HTMLElement | null>;
    onOpenTask?: (id: number, title: string) => void;
}) {
    // While the sheet closes, it keeps the last initiative that it showed.
    const [shown, setShown] = useState({ id, name });
    if (id !== null && (id !== shown.id || name !== shown.name)) {
        setShown({ id, name });
    }
    // Each draft gets a new form. The initiative that a draft created stays in the form of
    // the draft, so that the form is not loaded again. `id` changes from "new" directly to a
    // number only when the draft was created: to open another initiative, the sheet must
    // close first, and then `id` is `null` in between.
    const [draft, setDraft] = useState<{
        count: number;
        createdId: number | null;
    }>({ count: 0, createdId: null });
    const [previousId, setPreviousId] = useState(id);
    if (id !== previousId) {
        setPreviousId(id);
        if (id === "new") {
            setDraft((current) => ({
                count: current.count + 1,
                createdId: null,
            }));
        } else if (id !== null) {
            setDraft((current) => ({
                ...current,
                createdId: previousId === "new" ? id : null,
            }));
        }
    }
    const inDraftForm =
        shown.id === "new" ||
        (shown.id !== null && shown.id === draft.createdId);
    const bodyKey = inDraftForm ? `draft-${draft.count}` : `id-${shown.id}`;
    const nameInput = useRef<HTMLInputElement>(null);

    return (
        <Sheet
            open={id !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent
                side="right"
                initialFocus={id === "new" ? nameInput : true}
                finalFocus={finalFocus ?? true}
                className="gap-0 data-[side=right]:w-[min(40rem,100vw)] data-[side=right]:sm:max-w-none"
            >
                <SheetTitle className="sr-only">
                    {initiativeDisplayName(shown.name)}
                </SheetTitle>
                {shown.id !== null && (
                    <SheetBody
                        key={bodyKey}
                        id={shown.id}
                        draftProjectId={draftProjectId}
                        nameRef={nameInput}
                        onSaved={onSaved}
                        onCreated={onCreated}
                        onDelete={onDelete}
                        onClose={onClose}
                        onOpenTask={onOpenTask}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
}

/**
 * Loads the initiative and shows its form, or the fields disabled while it loads. For a
 * draft, it shows the form at once. When the draft is created, `id` changes to the identifier
 * of the new initiative, and the form stays.
 */
function SheetBody({
    id,
    draftProjectId,
    nameRef,
    onSaved,
    onCreated,
    onDelete,
    onClose,
    onOpenTask,
}: {
    id: SheetTarget;
    draftProjectId: number | null;
    nameRef: RefObject<HTMLInputElement | null>;
    onSaved: (summary: InitiativeSummary) => void;
    onCreated: (id: number) => void;
    onDelete: (id: number, savedName: string) => Promise<void>;
    onClose: () => void;
    onOpenTask?: (id: number, title: string) => void;
}) {
    // The initiative that the body loads, or `null` for a body that starts as a draft. Such a
    // body never loads, because its form has the saved values.
    const [loadId] = useState(id === "new" ? null : id);
    const [state, setState] = useState<LoadState>(
        loadId === null
            ? { kind: "loaded", initiative: null }
            : { kind: "loading" },
    );
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (loadId === null) return;
        let current = true;
        getInitiative(loadId).then(
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
    }, [loadId, attempt]);

    if (state.kind === "loaded") {
        return (
            <InitiativeForm
                initiative={state.initiative}
                draftProjectId={draftProjectId}
                onSaved={onSaved}
                onCreated={onCreated}
                onDelete={(savedName) => {
                    // The form shows "Delete" only after the draft is created, and then `id`
                    // is the identifier of the initiative.
                    if (id === "new") {
                        throw new Error("A draft has no initiative to delete");
                    }
                    return onDelete(id, savedName);
                }}
                onSave={onClose}
                onOpenTask={onOpenTask}
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
            <div className="flex items-start gap-4">
                <div className="grid gap-1.5">
                    <span className={FIELD_LABEL_CLASSES}>Role</span>
                    <NativeSelect aria-label="RACI role" disabled>
                        <NativeSelectOption value="" />
                    </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                    <span className={FIELD_LABEL_CLASSES}>Project</span>
                    <NativeSelect aria-label="Project" disabled>
                        <NativeSelectOption value="" />
                    </NativeSelect>
                </div>
            </div>
        </div>
    );
}
