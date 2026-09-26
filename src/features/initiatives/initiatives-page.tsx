import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArchivableList } from "@/components/archivable-list";
import { PageHeader } from "@/components/page-header";
import { PAGE_TITLE_CLASSES } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { useFailureToast } from "@/components/use-failure-toast";
import {
    createInitiative,
    initiativeDisplayName,
    listInitiatives,
    raciRoleLabel,
} from "@/lib/initiatives";

/** State that the Initiatives page gives the editor page when it opens a new initiative. */
export type NewInitiativeState = { isNew: true };

/**
 * State that the editor page gives the Initiatives page after it archives an initiative.
 * The Initiatives page then moves focus to the "New initiative" button, because the
 * button that the user clicked is gone.
 */
export type InitiativesPageState = { focusNewInitiative: true };

/** The page that lists the initiatives that are not archived and creates new ones. */
export function InitiativesPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const focusNewInitiative =
        (location.state as InitiativesPageState | null)?.focusNewInitiative ===
        true;
    const [creating, setCreating] = useState(false);
    const failureToast = useFailureToast();
    const newInitiativeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (focusNewInitiative) newInitiativeButtonRef.current?.focus();
    }, [focusNewInitiative]);

    async function create() {
        setCreating(true);
        try {
            const initiative = await createInitiative();
            failureToast.clear();
            const state: NewInitiativeState = { isNew: true };
            navigate(`/initiatives/${initiative.id}`, { state });
        } catch {
            failureToast.show("Couldn't create the initiative. Try again.");
            setCreating(false);
        }
    }

    return (
        // The header and the title stay in place, and the last row, which gets the
        // remaining height, scrolls.
        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)]">
            <PageHeader crumbs={[{ label: "Initiatives" }]}>
                <Button
                    ref={newInitiativeButtonRef}
                    onClick={create}
                    disabled={creating}
                >
                    <PlusIcon />
                    New initiative
                </Button>
            </PageHeader>
            <div className="flex flex-col gap-4 px-6 pb-2">
                <h1 className={PAGE_TITLE_CLASSES}>Initiatives</h1>
            </div>
            <ArchivableList
                kind="initiative"
                load={() => listInitiatives({ includeArchived: false })}
                itemPath={(initiative) => `/initiatives/${initiative.id}`}
                displayName={initiativeDisplayName}
                detail={(initiative) =>
                    initiative.raciRole && raciRoleLabel(initiative.raciRole)
                }
                emptyText="No initiatives yet"
                loadErrorText="Couldn't load initiatives"
                archiveFailureMessage="Couldn't archive the initiative. Try again."
                fallbackFocusRef={newInitiativeButtonRef}
            />
        </div>
    );
}
