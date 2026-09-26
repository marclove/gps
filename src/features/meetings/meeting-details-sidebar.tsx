import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

/**
 * The sidebar at the right side of the meeting editor page. It is as tall as the main
 * area. From top to bottom, it shows the properties of the meeting, the actions on the
 * whole meeting, a separator, and the lists that belong to the meeting. The properties
 * and the actions stay in place. Each list decides which of its areas scroll.
 */
export function MeetingDetailsSidebar({
    properties,
    actions,
    lists,
}: {
    /** The labeled rows of the properties of the meeting, such as its date. */
    properties: ReactNode;
    /** The buttons for actions on the whole meeting, such as Archive. */
    actions: ReactNode;
    /** The lists that belong to the meeting, such as its action items. */
    lists: ReactNode;
}) {
    return (
        <aside
            aria-label="Meeting details"
            className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-l"
        >
            <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-2">{properties}</div>
                <div className="flex flex-col gap-2">{actions}</div>
            </div>
            <Separator />
            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] pt-4">
                {lists}
            </div>
        </aside>
    );
}
