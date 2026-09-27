import { Trash2Icon } from "lucide-react";
import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type Ref,
} from "react";
import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import { SaveStatus } from "@/components/save-status";
import { useFailureToast } from "@/components/use-failure-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { useAutosave } from "@/hooks/use-autosave";
import {
    createInitiative,
    initiativeDisplayName,
    RACI_ROLES,
    renameInitiative,
    updateInitiative,
    type Initiative,
    type InitiativeSummary,
    type RaciRole,
} from "@/lib/initiatives";
import { cn } from "@/lib/utils";

/** The fields of an initiative that the form edits. */
type Draft = {
    name: string;
    description: string;
    raciRole: RaciRole | null;
};

/** The values of a draft, which is a new initiative that is not saved yet. */
const EMPTY_DRAFT: Draft = { name: "", description: "", raciRole: null };

/**
 * Returns true if the values are the values of a new draft: a name that is empty after
 * removing the spaces at its start and end, an empty description, and no role. Such a draft
 * is never saved.
 */
function isEmptyDraft(values: Draft): boolean {
    return (
        values.name.trim() === "" &&
        values.description === "" &&
        values.raciRole === null
    );
}

/** Returns the summary of an initiative, which is the initiative without its description. */
function toSummary(initiative: Initiative): InitiativeSummary {
    const summary: InitiativeSummary & { description?: string } = {
        ...initiative,
    };
    delete summary.description;
    return summary;
}

/** Returns the date of completion as text, such as "September 26, 2026", in local time. */
function completionDate(completedAt: string): string {
    return new Date(completedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

/**
 * The classes of the name field. The name is larger than the text of the other fields.
 * The input sets a smaller size for wide windows (`md:text-sm`), so this sets it again.
 */
export const NAME_FIELD_CLASSES = "h-10 text-lg font-semibold md:text-lg";

/**
 * The classes of a label above a field. The label starts where the text inside the field
 * starts: after the border (1px) and the left padding of the field.
 */
export const FIELD_LABEL_CLASSES = "pl-[calc(--spacing(2.5)+1px)] text-xs";

/**
 * The fields of one initiative: its name with the save status, its role, the date of
 * completion if it is completed, its description, a "Delete" button, and a "Save" button.
 * Changes are saved automatically. "Save" only calls `onSave`, which closes the sheet, and
 * the form then saves the changes that are waiting when it unmounts.
 *
 * When `initiative` is `null`, the form edits a draft: a new initiative with an empty name,
 * an empty description, and no role, which is not saved yet. The draft has no "Delete" button
 * and no save status, but a failed save shows "Couldn't save". The form creates the
 * initiative at the first save of a draft that is not empty, and then saves later changes as
 * for any other initiative. If the name of the draft is taken, the name field shows a
 * message, and the form creates the initiative with an empty name when the draft has a
 * description or a role. After the create, `onSaved` receives the summary, also when the
 * create finishes after the form unmounts, and `onCreated` receives the identifier while the
 * form is mounted.
 *
 * A name change is saved with a rename. If another initiative has the name, the name field
 * shows a message, and the other changes are still saved. `onSaved` receives the summary of
 * the initiative after each save that succeeds, also when the save finishes after the form
 * unmounts. When the user clicks "Delete", the form first saves the changes that are
 * waiting, and then calls `onDelete` with the name that the backend has for the initiative.
 * If a change cannot be saved, the form does not call `onDelete` and shows the failure toast
 * "Couldn't delete the initiative. Try again." The form must be in a `FailureToastProvider`.
 * The button is disabled until the promise of `onDelete` settles. `nameRef` receives the
 * name field.
 */
export function InitiativeForm({
    initiative,
    onSaved,
    onCreated,
    onDelete,
    onSave,
    nameRef,
}: {
    initiative: Initiative | null;
    onSaved: (summary: InitiativeSummary) => void;
    onCreated?: (id: number) => void;
    onDelete: (savedName: string) => Promise<void>;
    onSave: () => void;
    nameRef?: Ref<HTMLInputElement>;
}) {
    const [draft, setDraft] = useState<Draft>(
        initiative === null
            ? EMPTY_DRAFT
            : {
                  name: initiative.name,
                  description: initiative.description,
                  raciRole: initiative.raciRole,
              },
    );
    const [takenName, setTakenName] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    // The identifier of the initiative, or `null` while the draft is not saved. The ref gives
    // the identifier to a save that finishes after the form unmounts.
    const [id, setId] = useState(initiative?.id ?? null);
    const idRef = useRef(initiative?.id ?? null);
    // The name that the backend has for the initiative. The backend trims names.
    const savedName = useRef(initiative?.name ?? "");
    // The values that the backend has now. They are refs, so that a save that finishes after
    // the form unmounts still compares with the correct values.
    const saved = useRef<Draft>({ ...draft });
    const mounted = useRef(true);
    const onSavedRef = useRef(onSaved);
    const onCreatedRef = useRef(onCreated);
    const nameId = useId();
    const roleId = useId();
    const messageId = useId();

    useEffect(() => {
        onSavedRef.current = onSaved;
        onCreatedRef.current = onCreated;
    }, [onSaved, onCreated]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Creates the initiative from a draft that is not empty. If the name is taken, the draft
    // is created with an empty name when it has a description or a role.
    const create = useCallback(async (next: Draft) => {
        if (isEmptyDraft(next)) {
            if (mounted.current) setTakenName(null);
            return;
        }
        let result = await createInitiative(next);
        let values = next;
        if (result.status === "nameTaken") {
            // A name that is taken is not a failed save.
            if (mounted.current) setTakenName(next.name.trim());
            values = { ...next, name: "" };
            if (isEmptyDraft(values)) return;
            result = await createInitiative(values);
            // An empty name is never taken.
            if (result.status === "nameTaken") return;
        } else if (mounted.current) {
            setTakenName(null);
        }
        const created = result.initiative;
        idRef.current = created.id;
        saved.current = { ...values };
        savedName.current = created.name;
        onSavedRef.current(toSummary(created));
        if (mounted.current) {
            setId(created.id);
            onCreatedRef.current?.(created.id);
        }
    }, []);

    const save = useCallback(
        async (next: Draft) => {
            const savedId = idRef.current;
            if (savedId === null) {
                await create(next);
                return;
            }
            if (next.name !== saved.current.name) {
                const result = await renameInitiative(savedId, next.name);
                if (result.status === "renamed") {
                    saved.current.name = next.name;
                    savedName.current = result.initiative.name;
                    onSavedRef.current(toSummary(result.initiative));
                    if (mounted.current) setTakenName(null);
                } else if (mounted.current) {
                    // A name that is taken is not a failed save, so the save continues.
                    setTakenName(next.name.trim());
                }
            } else if (mounted.current) {
                setTakenName(null);
            }
            if (
                next.description !== saved.current.description ||
                next.raciRole !== saved.current.raciRole
            ) {
                const changes = {
                    description: next.description,
                    raciRole: next.raciRole,
                };
                const updated = await updateInitiative(savedId, changes);
                saved.current = { ...saved.current, ...changes };
                onSavedRef.current(toSummary(updated));
            }
        },
        [create],
    );
    const { status, retry, flush } = useAutosave(draft, save);
    const failureToast = useFailureToast();

    async function deleteInitiative() {
        setDeleting(true);
        try {
            // A change that is not saved would be saved again when the form unmounts, and
            // could rename the initiative after the archive toast shows its name.
            if (!(await flush())) {
                failureToast.show("Couldn't delete the initiative. Try again.");
                return;
            }
            await onDelete(savedName.current);
        } finally {
            if (mounted.current) setDeleting(false);
        }
    }

    const completedAt = initiative?.completedAt ?? null;

    const changeDescription = useCallback(
        (description: string) =>
            setDraft((current) => ({ ...current, description })),
        [],
    );

    return (
        // The header, the role, and the completion date are at the top, and the "Delete"
        // and "Save" buttons are at the bottom. The description gets the remaining height and scrolls
        // its text itself.
        <div
            className={cn(
                "grid min-h-0 flex-1",
                completedAt === null
                    ? "grid-rows-[auto_auto_minmax(0,1fr)_auto]"
                    : "grid-rows-[auto_auto_auto_minmax(0,1fr)_auto]",
            )}
        >
            {/* The right padding keeps the close button of the sheet clear of the save status. */}
            <div className="flex flex-col gap-1.5 py-4 pr-14 pl-6">
                <label htmlFor={nameId} className={FIELD_LABEL_CLASSES}>
                    Name
                </label>
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <Input
                            ref={nameRef}
                            id={nameId}
                            aria-label="Initiative name"
                            value={draft.name}
                            placeholder={initiativeDisplayName("")}
                            aria-invalid={takenName !== null || undefined}
                            aria-describedby={
                                takenName !== null ? messageId : undefined
                            }
                            onChange={(event) => {
                                const name = event.target.value;
                                setDraft((current) => ({ ...current, name }));
                            }}
                            className={NAME_FIELD_CLASSES}
                        />
                        {takenName !== null && (
                            <p
                                id={messageId}
                                className="mt-1 text-sm text-destructive"
                            >
                                Another initiative is named "{takenName}".
                            </p>
                        )}
                    </div>
                    <div className="flex h-10 shrink-0 items-center">
                        {(id !== null || status === "error") && (
                            <SaveStatus status={status} onRetry={retry} />
                        )}
                    </div>
                </div>
            </div>
            <div className="flex flex-col items-start gap-1.5 px-6 pb-4">
                <label htmlFor={roleId} className={FIELD_LABEL_CLASSES}>
                    Role
                </label>
                <NativeSelect
                    id={roleId}
                    aria-label="RACI role"
                    value={draft.raciRole ?? ""}
                    onChange={(event) => {
                        // The empty choice means that the user has no role.
                        const value = event.target.value;
                        const raciRole =
                            value === "" ? null : (value as RaciRole);
                        setDraft((current) => ({ ...current, raciRole }));
                    }}
                >
                    <NativeSelectOption value="" />
                    {RACI_ROLES.map((role) => (
                        <NativeSelectOption key={role.value} value={role.value}>
                            {role.label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </div>
            {completedAt !== null && (
                <p className="px-6 pb-4 text-sm text-muted-foreground">
                    Completed on {completionDate(completedAt)}
                </p>
            )}
            <MarkdownEditor
                initialMarkdown={initiative?.description ?? ""}
                onChange={changeDescription}
                label="Description"
            />
            <div className="flex items-center justify-between border-t px-6 py-4">
                {id !== null ? (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={deleting}
                        onClick={() => void deleteInitiative()}
                    >
                        <Trash2Icon />
                        Delete
                    </Button>
                ) : (
                    // Keeps "Save" at the right.
                    <span />
                )}
                <Button size="sm" onClick={onSave}>
                    Save
                </Button>
            </div>
        </div>
    );
}
