import { NotebookPenIcon } from "lucide-react";
import { Link, useLocation } from "react-router";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar";

/** A section of the application that the sidebar links to. */
type Section = { title: string; path: string };

const SECTIONS: Section[] = [{ title: "Meetings", path: "/meetings" }];

/**
 * The floating sidebar with the application name, the button that hides the sidebar, and
 * the navigation between sections.
 */
export function AppSidebar() {
    const { pathname } = useLocation();
    const { open } = useSidebar();

    return (
        <Sidebar side="right" variant="floating">
            {/* The header is 48 pixels tall inside the 8 pixel margin of the sidebar, so
                its center lines up with the center of the 64 pixel page header. */}
            <SidebarHeader
                data-tauri-drag-region="deep"
                className="h-12 flex-row items-center justify-between py-0"
            >
                <div className="flex items-center gap-2">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                        <NotebookPenIcon className="size-4" />
                    </div>
                    <span className="font-medium">gps</span>
                </div>
                {/* When the sidebar is hidden, the page header shows this button instead.
                    Only one of the two is rendered at a time. */}
                {open && <SidebarTrigger />}
            </SidebarHeader>
            <SidebarSeparator />
            <SidebarContent>
                <nav aria-label="Main">
                    <SidebarGroup>
                        <SidebarMenu className="gap-2">
                            {SECTIONS.map((section) => (
                                <SidebarMenuItem key={section.path}>
                                    <SidebarMenuButton
                                        isActive={pathname.startsWith(
                                            section.path,
                                        )}
                                        render={
                                            <Link
                                                to={section.path}
                                                className="font-medium"
                                            />
                                        }
                                    >
                                        {section.title}
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroup>
                </nav>
            </SidebarContent>
        </Sidebar>
    );
}
