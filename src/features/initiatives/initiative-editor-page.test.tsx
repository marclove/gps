import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { ArchiveProvider } from "@/components/archive-provider";
import { FailureToastProvider } from "@/components/failure-toast-provider";
import { Toaster } from "@/components/toaster";
import { toast } from "@/components/ui/toast";
import { InitiativeEditorPage } from "./initiative-editor-page";
import { InitiativesPage } from "./initiatives-page";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

/** Renders the Initiatives page and the editor page, and opens the editor page of `path`. */
function renderPages(path: string) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Toaster toastManager={toast}>
                <FailureToastProvider>
                    <ArchiveProvider>
                        <Routes>
                            <Route
                                path="/initiatives"
                                element={<InitiativesPage />}
                            />
                            <Route
                                path="/initiatives/:id"
                                element={<InitiativeEditorPage />}
                            />
                        </Routes>
                    </ArchiveProvider>
                </FailureToastProvider>
            </Toaster>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (command: string) => {
        switch (command) {
            case "list_initiatives":
                return [];
            case "get_initiative":
                return null;
            default:
                throw `unexpected command ${command}`;
        }
    });
});

describe("InitiativeEditorPage", () => {
    it("shows a message and a link to the Initiatives page when the initiative does not exist", async () => {
        const user = userEvent.setup();
        renderPages("/initiatives/99");

        expect(
            await screen.findByText("This initiative doesn't exist.", {
                exact: false,
            }),
        ).toBeInTheDocument();
        expect(invoke).toHaveBeenCalledWith("get_initiative", { id: 99 });

        await user.click(
            screen.getByRole("link", { name: "Back to Initiatives" }),
        );

        expect(
            await screen.findByRole("button", { name: "New initiative" }),
        ).toBeInTheDocument();
        expect(
            await screen.findByText("No initiatives yet"),
        ).toBeInTheDocument();
    });
});
