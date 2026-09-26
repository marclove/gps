import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

/**
 * The grid classes of an editor page with a `DetailsSidebar`. The first column holds the
 * editor and gets the remaining width. The second column holds the sidebar, and its
 * width changes with the window width, between 18rem and 24rem. The one row fills the
 * height of the main area.
 */
export const DETAILS_PAGE_COLUMNS =
    "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(18rem,calc(11rem_+_11vw),24rem)] grid-rows-[minmax(0,1fr)]";

/**
 * The sidebar at the right side of an editor page, such as the meeting editor. It is as
 * tall as the main area. From top to bottom, it shows the properties of the item, the
 * actions on the whole item, a separator, and the lists that belong to the item. The
 * properties and the actions stay in place. Each list decides which of its areas scroll.
 * If there are no lists, the sidebar shows no separator and no list area.
 */
export function DetailsSidebar({
    label,
    properties,
    actions,
    lists,
}: {
    /** The accessible name of the sidebar landmark, such as "Meeting details". */
    label: string;
    /** The labeled rows of the properties of the item, such as its date. */
    properties: ReactNode;
    /** The buttons for actions on the whole item, such as Archive. */
    actions: ReactNode;
    /** The lists that belong to the item, such as its action items. */
    lists?: ReactNode;
}) {
    return (
        <aside
            aria-label={label}
            className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-l"
        >
            <div className="flex flex-col gap-4 px-6 pt-4 pb-6">
                <div className="flex flex-col gap-2">{properties}</div>
                {/* The buttons are as wide as their content, in a row that wraps. */}
                <div className="flex flex-wrap gap-2">{actions}</div>
            </div>
            {lists !== undefined && (
                <>
                    <Separator />
                    <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] pt-6">
                        {lists}
                    </div>
                </>
            )}
        </aside>
    );
}
