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

/** One item of the breadcrumb trail. An item without `to` is the current page. */
export type Crumb = { label: string; to?: string };

/**
 * The header at the top of each page. It shows the breadcrumb trail and optional content at
 * the right side, such as a status. When the sidebar is hidden, it also shows the button
 * that shows the sidebar again.
 *
 * The header is also a drag region for the window. Its left padding keeps the breadcrumb
 * trail clear of the macOS window controls.
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
            className="flex h-16 shrink-0 items-center gap-2 pr-4 pl-24"
        >
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
            <div className="ml-auto flex items-center gap-2">
                {children}
                {!open && (
                    <>
                        {children && (
                            <Separator
                                orientation="vertical"
                                className="ml-2 data-vertical:h-4 data-vertical:self-auto"
                            />
                        )}
                        <SidebarTrigger className="-mr-1" />
                    </>
                )}
            </div>
        </header>
    );
}
