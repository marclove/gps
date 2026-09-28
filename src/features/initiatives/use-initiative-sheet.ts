import { useRef, useState, type RefObject } from "react";
import { useDelete } from "@/components/use-delete";
import { useFailureToast } from "@/components/use-failure-toast";
import type { SheetTarget } from "./initiative-sheet";

/** The props of `InitiativeSheet` that `useInitiativeSheet` gives. */
export type InitiativeSheetControl = {
    id: SheetTarget | null;
    onClose: () => void;
    onCreated: (id: number) => void;
    onDelete: (id: number, savedName: string) => Promise<void>;
    finalFocus: RefObject<HTMLElement | null> | undefined;
};

/**
 * Controls the sheet of an initiative for a page that lists initiatives and has a "New
 * initiative" button.
 *
 * - `openInitiative` opens the sheet of the initiative with the identifier.
 * - `openDraft` opens the sheet for a draft. When the draft creates an initiative, the sheet
 *   goes on to edit that initiative.
 * - `newButton` is the ref for the "New initiative" button of the page.
 * - `sheet` has the props that the page gives to `InitiativeSheet`, together with the props
 *   that only the page knows.
 *
 * When the user deletes the initiative in the sheet, the hook deletes it and shows the
 * delete toast. Then it closes the sheet, moves the focus to "New initiative", because the
 * row or card that opened the sheet is gone, and calls `onDeleted` with the identifier. If
 * the delete fails, the sheet stays open, and a failure toast says "Couldn't delete the
 * initiative. Try again."
 */
export function useInitiativeSheet({
    onDeleted,
}: {
    onDeleted: (id: number) => void;
}) {
    // The initiative whose sheet is open, "new" for a draft, or `null`.
    const [openId, setOpenId] = useState<SheetTarget | null>(null);
    // True when the sheet closes because its initiative was deleted. Then the focus goes to
    // "New initiative", because the element that opened the sheet is gone.
    const [focusNewOnClose, setFocusNewOnClose] = useState(false);
    const newButton = useRef<HTMLButtonElement>(null);
    const { deleteItem } = useDelete();
    const failureToast = useFailureToast();

    function openInitiative(id: number) {
        setFocusNewOnClose(false);
        setOpenId(id);
    }

    function openDraft() {
        setFocusNewOnClose(false);
        setOpenId("new");
    }

    function editCreated(id: number) {
        // The draft sheet goes on to edit the initiative that it created.
        setOpenId((current) => (current === "new" ? id : current));
    }

    async function deleteInitiative(id: number, savedName: string) {
        try {
            await deleteItem({ kind: "initiative", id, name: savedName });
        } catch {
            failureToast.show("Couldn't delete the initiative. Try again.");
            return;
        }
        failureToast.clear();
        setFocusNewOnClose(true);
        setOpenId((current) => (current === id ? null : current));
        onDeleted(id);
    }

    const sheet: InitiativeSheetControl = {
        id: openId,
        onClose: () => setOpenId(null),
        onCreated: editCreated,
        onDelete: deleteInitiative,
        finalFocus: focusNewOnClose ? newButton : undefined,
    };

    return { openId, openInitiative, openDraft, newButton, sheet };
}
