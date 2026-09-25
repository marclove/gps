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
} from "@/components/ui/sidebar";

/** A section of the application that the sidebar links to. */
type Section = { title: string; path: string };

const SECTIONS: Section[] = [{ title: "Meetings", path: "/meetings" }];

/** The floating sidebar with the application name and the navigation between sections. */
export function AppSidebar() {
    const { pathname } = useLocation();

    return (
        <Sidebar side="right" variant="floating">
            <SidebarHeader data-tauri-drag-region="deep">
                <div className="flex items-center gap-2 p-2">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                        <NotebookPenIcon className="size-4" />
                    </div>
                    <span className="font-medium">gps</span>
                </div>
            </SidebarHeader>
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
