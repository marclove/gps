import { CSSProperties } from "react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MeetingEditorPage } from "@/features/meetings/meeting-editor-page";
import { MeetingsPage } from "@/features/meetings/meetings-page";

function App() {
    return (
        <TooltipProvider>
            <MemoryRouter>
                <SidebarProvider
                    className="h-svh"
                    style={{ "--sidebar-width": "19rem" } as CSSProperties}
                >
                    <AppSidebar />
                    <SidebarInset className="min-h-0">
                        <Routes>
                            <Route
                                path="/"
                                element={<Navigate to="/meetings" replace />}
                            />
                            <Route
                                path="/meetings"
                                element={<MeetingsPage />}
                            />
                            <Route
                                path="/meetings/:id"
                                element={<MeetingEditorPage />}
                            />
                        </Routes>
                    </SidebarInset>
                </SidebarProvider>
            </MemoryRouter>
        </TooltipProvider>
    );
}

export default App;
