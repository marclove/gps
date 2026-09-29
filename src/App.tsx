import { MemoryRouter, Navigate, Route, Routes } from "react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeleteProvider } from "@/components/delete-provider";
import { InitiativesPage } from "@/features/initiatives/initiatives-page";
import { MeetingEditorPage } from "@/features/meetings/meeting-editor-page";
import { MeetingsPage } from "@/features/meetings/meetings-page";
import { ProjectPage } from "@/features/projects/project-page";
import { ProjectsPage } from "@/features/projects/projects-page";
import { WorkPage } from "@/features/work/work-page";

function App() {
    return (
        <TooltipProvider>
            <Toaster toastManager={toast}>
                <FailureToastProvider>
                    <DeleteProvider>
                        <MemoryRouter>
                            <SidebarProvider className="h-svh">
                                <AppSidebar />
                                <SidebarInset className="min-h-0 overflow-hidden">
                                    <Routes>
                                        <Route
                                            path="/"
                                            element={
                                                <Navigate
                                                    to="/meetings"
                                                    replace
                                                />
                                            }
                                        />
                                        <Route
                                            path="/projects"
                                            element={<ProjectsPage />}
                                        />
                                        <Route
                                            path="/projects/:id"
                                            element={<ProjectPage />}
                                        />
                                        <Route
                                            path="/meetings"
                                            element={<MeetingsPage />}
                                        />
                                        <Route
                                            path="/meetings/:id"
                                            element={<MeetingEditorPage />}
                                        />
                                        <Route
                                            path="/initiatives"
                                            element={<InitiativesPage />}
                                        />
                                        <Route
                                            path="/work"
                                            element={<WorkPage />}
                                        />
                                    </Routes>
                                </SidebarInset>
                            </SidebarProvider>
                        </MemoryRouter>
                    </DeleteProvider>
                </FailureToastProvider>
            </Toaster>
        </TooltipProvider>
    );
}

export default App;
