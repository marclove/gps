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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { useAutosave } from "@/hooks/use-autosave";
import {
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
 * The fields of one initiative: its name with the save status, its role, the date of
 * completion if it is completed, its description, and a "Delete" button. Changes are saved
 * automatically.
 *
 * A name change is saved with a rename. If another initiative has the name, the name field
 * shows a message, and the other changes are still saved. `onSaved` receives the summary of
 * the initiative after each save that succeeds, also when the save finishes after the form
 * unmounts. `onDelete` is called when the user clicks "Delete". `nameRef` receives the name
 * field.
 */
export function InitiativeForm({
    initiative,
    onSaved,
    onDelete,
    nameRef,
}: {
    initiative: Initiative;
    onSaved: (summary: InitiativeSummary) => void;
    onDelete: () => void;
    nameRef?: Ref<HTMLInputElement>;
}) {
    const [draft, setDraft] = useState<Draft>({
        name: initiative.name,
        description: initiative.description,
        raciRole: initiative.raciRole,
    });
    const [takenName, setTakenName] = useState<string | null>(null);
    // The values that the backend has now. They are refs, so that a save that finishes after
    // the form unmounts still compares with the correct values.
    const saved = useRef<Draft>({ ...draft });
    const mounted = useRef(true);
    const onSavedRef = useRef(onSaved);
    const roleId = useId();
    const messageId = useId();

    useEffect(() => {
        onSavedRef.current = onSaved;
    }, [onSaved]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const save = useCallback(
        async (next: Draft) => {
            if (next.name !== saved.current.name) {
                const result = await renameInitiative(initiative.id, next.name);
                if (result.status === "renamed") {
                    saved.current.name = next.name;
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
                const updated = await updateInitiative(initiative.id, changes);
                saved.current = { ...saved.current, ...changes };
                onSavedRef.current(toSummary(updated));
            }
        },
        [initiative.id],
    );
    const { status, retry } = useAutosave(draft, save);

    const changeDescription = useCallback(
        (description: string) =>
            setDraft((current) => ({ ...current, description })),
        [],
    );

    return (
        // The header, the role, and the completion date are at the top, and the "Delete"
        // button is at the bottom. The description gets the remaining height and scrolls
        // its text itself.
        <div
            className={cn(
                "grid min-h-0 flex-1",
                initiative.completedAt === null
                    ? "grid-rows-[auto_auto_minmax(0,1fr)_auto]"
                    : "grid-rows-[auto_auto_auto_minmax(0,1fr)_auto]",
            )}
        >
            {/* The right padding keeps the close button of the sheet clear of the save status. */}
            <div className="flex items-start gap-2 py-4 pr-14 pl-6">
                <div className="min-w-0 flex-1">
                    <Input
                        ref={nameRef}
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
                        className="text-base font-semibold"
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
                <div className="flex h-8 shrink-0 items-center">
                    <SaveStatus status={status} onRetry={retry} />
                </div>
            </div>
            <div className="flex items-center gap-2 px-6 pb-4">
                <label htmlFor={roleId} className="text-sm font-medium">
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
            {initiative.completedAt !== null && (
                <p className="px-6 pb-4 text-sm text-muted-foreground">
                    Completed on {completionDate(initiative.completedAt)}
                </p>
            )}
            <MarkdownEditor
                initialMarkdown={initiative.description}
                onChange={changeDescription}
                label="Description"
            />
            <div className="border-t px-6 py-4">
                <Button variant="outline" size="sm" onClick={onDelete}>
                    <Trash2Icon />
                    Delete
                </Button>
            </div>
        </div>
    );
}
