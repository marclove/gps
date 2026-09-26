import { MemoryRouter, Navigate, Route, Routes } from "react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ArchiveProvider } from "@/features/meetings/archive-provider";
import { MeetingEditorPage } from "@/features/meetings/meeting-editor-page";
import { MeetingsPage } from "@/features/meetings/meetings-page";

function App() {
    return (
        <TooltipProvider>
            <Toaster toastManager={toast}>
                <ArchiveProvider>
                    <MemoryRouter>
                        <SidebarProvider className="h-svh">
                            <AppSidebar />
                            <SidebarInset className="min-h-0 overflow-hidden">
                                <Routes>
                                    <Route
                                        path="/"
                                        element={
                                            <Navigate to="/meetings" replace />
                                        }
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
                </ArchiveProvider>
            </Toaster>
        </TooltipProvider>
    );
}

export default App;
