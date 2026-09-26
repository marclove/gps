import { NotebookPenIcon, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";

/** A section of the application that the sidebar links to. */
type Section = { title: string; path: string; icon: LucideIcon };

const SECTIONS: Section[] = [
    { title: "Meetings", path: "/meetings", icon: NotebookPenIcon },
];

/**
 * The navigation between sections. It is a narrow column of section icons that is always shown.
 */
export function AppSidebar() {
    return (
        <Sidebar
            collapsible="none"
            className="w-[calc(var(--sidebar-width-icon)+1px)] border-r border-sidebar-border"
        >
            <SidebarContent>
                <nav aria-label="Main">
                    <SidebarGroup>
                        <SidebarMenu className="gap-2">
                            {SECTIONS.map((section) => (
                                <SidebarMenuItem key={section.path}>
                                    <SidebarMenuButton
                                        className="aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground"
                                        render={
                                            <NavLink
                                                to={section.path}
                                                // WebKit on macOS leaves links out of the Tab order by
                                                // default. An explicit tab index puts the link back in it.
                                                tabIndex={0}
                                            />
                                        }
                                        tooltip={{
                                            children: section.title,
                                            hidden: false,
                                        }}
                                    >
                                        <section.icon />
                                        <span className="sr-only">
                                            {section.title}
                                        </span>
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
