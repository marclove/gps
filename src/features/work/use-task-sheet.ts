import {
    createElement,
    useRef,
    useState,
    type ReactNode,
    type RefObject,
} from "react";
import { useDelete } from "@/components/use-delete";
import { useFailureToast } from "@/components/use-failure-toast";
import type { Task } from "@/lib/tasks";
import { TaskSheet, type TaskSheetTarget } from "./task-sheet";

/** The task whose sheet is open. */
type OpenTask = {
    id: TaskSheetTarget;
    /** The title that the sheet shows as its name. */
    title: string;
    /** The number of the draft, so that a late create of a closed draft is not taken for another draft. */
    draft: number;
};

/**
 * Controls the task sheet for a page that shows tasks. The page puts `sheet` anywhere in
 * its tree.
 *
 * - `openTask` opens the sheet of the task with the identifier. `title` is the title of the
 *   task that the page shows. The sheet uses it as its name until it has loaded the task.
 * - `openDraft` opens the sheet for a draft. When the draft creates a task, the sheet goes on
 *   to edit that task.
 * - `openId` is the task whose sheet is open, "new" for a draft, or `null`.
 *
 * The options are the callbacks of the page. `onSaved` receives the task after each save
 * that succeeds, also after the create of a draft. `onCreated` receives the task that a draft
 * created, once. When the user deletes the task in the sheet, the hook deletes it and shows
 * the delete toast. Then it closes the sheet, moves the focus to `focusAfterDelete` if the page
 * gives it, because the element that opened the sheet is gone, and calls `onDeleted` with the
 * identifier. The hook calls `onDeleted` before the sheet gives the focus away, so the page
 * can set `focusAfterDelete` in it. If the delete fails, the sheet stays open, and a failure toast says "Couldn't
 * delete the task. Try again."
 */
export function useTaskSheet({
    onSaved,
    onCreated,
    onDeleted,
    focusAfterDelete,
}: {
    onSaved?: (task: Task) => void;
    onCreated?: (task: Task) => void;
    onDeleted?: (id: number) => void;
    focusAfterDelete?: RefObject<HTMLElement | null>;
}): {
    openId: TaskSheetTarget | null;
    openTask: (id: number, title: string) => void;
    openDraft: () => void;
    sheet: ReactNode;
} {
    const [open, setOpen] = useState<OpenTask | null>(null);
    // True when the sheet closes because its task was deleted.
    const [focusAfterClose, setFocusAfterClose] = useState(false);
    const drafts = useRef(0);
    const { deleteItem } = useDelete();
    const failureToast = useFailureToast();

    function openTask(id: number, title: string) {
        setFocusAfterClose(false);
        setOpen({ id, title, draft: 0 });
    }

    function openDraft() {
        setFocusAfterClose(false);
        drafts.current += 1;
        setOpen({ id: "new", title: "", draft: drafts.current });
    }

    // Shows the title of the task as the name of the sheet, if the sheet shows the task.
    function showTitle(task: Task) {
        setOpen((current) =>
            current?.id === task.id
                ? { ...current, title: task.title }
                : current,
        );
    }

    // The draft whose form gives the callbacks below.
    const draft = open?.draft ?? 0;

    function created(task: Task) {
        // The draft sheet goes on to edit the task that it created, if it is still open.
        setOpen((current) =>
            current?.id === "new" && current.draft === draft
                ? { ...current, id: task.id, title: task.title }
                : current,
        );
        onCreated?.(task);
    }

    function saved(task: Task) {
        showTitle(task);
        onSaved?.(task);
    }

    async function deleteTask(savedTitle: string) {
        const id = open?.id;
        // The form shows "Delete" only after the draft is created.
        if (id === undefined || id === "new") {
            throw new Error("A draft has no task to delete");
        }
        try {
            await deleteItem({ kind: "task", id, name: savedTitle });
        } catch {
            failureToast.show("Couldn't delete the task. Try again.");
            return;
        }
        failureToast.clear();
        setFocusAfterClose(true);
        setOpen((current) => (current?.id === id ? null : current));
        onDeleted?.(id);
    }

    const sheet = createElement(TaskSheet, {
        id: open?.id ?? null,
        title: open?.title ?? "",
        onClose: () => setOpen(null),
        onLoaded: showTitle,
        onSaved: saved,
        onCreated: created,
        onDelete: deleteTask,
        finalFocus: focusAfterClose ? focusAfterDelete : undefined,
    });

    return { openId: open?.id ?? null, openTask, openDraft, sheet };
}
