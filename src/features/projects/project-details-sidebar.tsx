import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

/**
 * The sidebar at the right side of the project page. It is as tall as the main area. From
 * top to bottom, it shows the actions on the whole project, a separator, and the lists that
 * belong to the project. The actions stay in place. Each list gets a row, and the rows share
 * the height that is left equally. Each list decides which of its areas scroll. When there
 * are no lists, the sidebar shows only the actions.
 */
export function ProjectDetailsSidebar({
    actions,
    lists,
}: {
    /** The buttons for actions on the whole project, such as Delete. */
    actions?: ReactNode;
    /**
     * The lists that belong to the project, such as its initiatives and its meetings. Each
     * top element of `lists` gets a row.
     */
    lists?: ReactNode;
}) {
    return (
        <aside
            aria-label="Project details"
            className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-l"
        >
            {/* The buttons are as wide as their content, in a row that wraps. */}
            <div className="flex flex-wrap gap-2 px-6 pt-4 pb-6">{actions}</div>
            {lists !== undefined && (
                <>
                    <Separator />
                    <div className="grid min-h-0 auto-rows-[minmax(0,1fr)] gap-6 pt-6">
                        {lists}
                    </div>
                </>
            )}
        </aside>
    );
}
