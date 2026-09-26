import { ArchiveIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
    DETAILS_PAGE_COLUMNS,
    DetailsSidebar,
} from "@/components/details-sidebar";
import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import { PageHeader } from "@/components/page-header";
import { PAGE_TITLE_CLASSES } from "@/components/page-title";
import { SaveStatus } from "@/components/save-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { useArchive } from "@/components/use-archive";
import { useFailureToast } from "@/components/use-failure-toast";
import { useAutosave } from "@/hooks/use-autosave";
import {
    initiativeDisplayName,
    RACI_ROLES,
    updateInitiative,
    type Initiative,
    type InitiativeChanges,
    type RaciRole,
} from "@/lib/initiatives";
import { cn } from "@/lib/utils";
import type { InitiativesPageState } from "./initiatives-page";

/**
 * The editor for one initiative: its name and its description at the left, and a sidebar
 * with the role of the user and the Archive button at the right. Changes are saved
 * automatically. If `isNew` is true, the name field gets the focus and its text is
 * selected.
 */
export function InitiativeEditor({
    initiative,
    isNew,
}: {
    initiative: Initiative;
    isNew: boolean;
}) {
    const [draft, setDraft] = useState<InitiativeChanges>({
        name: initiative.name,
        description: initiative.description,
        raciRole: initiative.raciRole,
    });
    const save = useCallback(
        (changes: InitiativeChanges) =>
            updateInitiative(initiative.id, changes),
        [initiative.id],
    );
    const { status, retry } = useAutosave(draft, save);
    const nameInput = useRef<HTMLInputElement>(null);
    const roleId = useId();
    const navigate = useNavigate();
    const { archive: archiveInProvider } = useArchive();
    const [archiving, setArchiving] = useState(false);
    const failureToast = useFailureToast();

    useEffect(() => {
        if (!isNew) return;
        // `select()` alone does not move the focus to the field.
        nameInput.current?.focus();
        nameInput.current?.select();
    }, [isNew]);

    const changeDescription = useCallback(
        (description: string) =>
            setDraft((current) => ({ ...current, description })),
        [],
    );

    async function archive() {
        setArchiving(true);
        try {
            await archiveInProvider({
                kind: "initiative",
                id: initiative.id,
                name: draft.name,
            });
            failureToast.clear();
            const state: InitiativesPageState = { focusNewInitiative: true };
            navigate("/initiatives", { state });
        } catch {
            failureToast.show("Couldn't archive the initiative. Try again.");
            setArchiving(false);
        }
    }

    return (
        // The description is at the left, and the initiative details sidebar is at the
        // right, as tall as the main area. In the left column, the header and the name row
        // stay in place, and the description editor gets the remaining height and scrolls
        // the description itself.
        <div className={DETAILS_PAGE_COLUMNS}>
            <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]">
                <PageHeader
                    crumbs={[
                        { label: "Initiatives", to: "/initiatives" },
                        { label: initiativeDisplayName(draft.name) },
                    ]}
                >
                    <SaveStatus status={status} onRetry={retry} />
                </PageHeader>
                <div className="px-6 pb-4">
                    <Input
                        ref={nameInput}
                        aria-label="Initiative name"
                        value={draft.name}
                        placeholder={initiativeDisplayName("")}
                        onChange={(event) => {
                            const name = event.target.value;
                            setDraft((current) => ({ ...current, name }));
                        }}
                        className={cn(
                            PAGE_TITLE_CLASSES,
                            "h-auto border-none px-0 shadow-none focus-visible:ring-0",
                        )}
                    />
                </div>
                <MarkdownEditor
                    initialMarkdown={initiative.description}
                    onChange={changeDescription}
                    label="Description"
                />
            </div>
            <DetailsSidebar
                label="Initiative details"
                properties={
                    <div className="flex items-center justify-between gap-2">
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
                                setDraft((current) => ({
                                    ...current,
                                    raciRole,
                                }));
                            }}
                        >
                            <NativeSelectOption value="" />
                            {RACI_ROLES.map((role) => (
                                <NativeSelectOption
                                    key={role.value}
                                    value={role.value}
                                >
                                    {role.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>
                }
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={archiving}
                        onClick={archive}
                    >
                        <ArchiveIcon />
                        Archive
                    </Button>
                }
            />
        </div>
    );
}
