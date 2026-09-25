import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/** One item of the breadcrumb trail. An item without `to` is the current page. */
export type Crumb = { label: string; to?: string };

/**
 * The header at the top of each page. It shows the button that shows or hides the sidebar,
 * the breadcrumb trail, and optional content at the right side, such as a status.
 *
 * The header is also a drag region for the window. When the sidebar is hidden, the header
 * moves its content to the right, clear of the macOS window controls.
 */
export function PageHeader({
    crumbs,
    children,
}: {
    crumbs: Crumb[];
    children?: ReactNode;
}) {
    const { open } = useSidebar();

    return (
        <header
            data-tauri-drag-region="deep"
            className={cn(
                "flex h-16 shrink-0 items-center gap-2 px-4",
                !open && "pl-24",
            )}
        >
            <SidebarTrigger className="-ml-1" />
            <Separator
                orientation="vertical"
                className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
                <BreadcrumbList>
                    {crumbs.map((crumb, index) => (
                        <Fragment key={index}>
                            {index > 0 && <BreadcrumbSeparator />}
                            <BreadcrumbItem>
                                {crumb.to ? (
                                    <BreadcrumbLink
                                        render={<Link to={crumb.to} />}
                                    >
                                        {crumb.label}
                                    </BreadcrumbLink>
                                ) : (
                                    <BreadcrumbPage>
                                        {crumb.label}
                                    </BreadcrumbPage>
                                )}
                            </BreadcrumbItem>
                        </Fragment>
                    ))}
                </BreadcrumbList>
            </Breadcrumb>
            {children && (
                <div className="ml-auto flex items-center gap-2">
                    {children}
                </div>
            )}
        </header>
    );
}
