import { render, screen, within } from "@testing-library/react";
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

const BLANK_INITIATIVE = {
    id: 1,
    name: "   ",
    description: "",
    raciRole: null,
    createdAt: "2026-09-24T17:00:00.000Z",
    updatedAt: "2026-09-24T17:00:00.000Z",
    archivedAt: null,
};

function renderPages() {
    render(
        <MemoryRouter initialEntries={["/initiatives"]}>
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
            case "list_initiatives": {
                const { id, name, raciRole, updatedAt, archivedAt } =
                    BLANK_INITIATIVE;
                return [{ id, name, raciRole, updatedAt, archivedAt }];
            }
            case "get_initiative":
                return BLANK_INITIATIVE;
            default:
                throw `unexpected command ${command}`;
        }
    });
});

describe("InitiativesPage", () => {
    it("shows an initiative whose name has only spaces as Untitled initiative", async () => {
        const user = userEvent.setup();
        renderPages();

        const link = await screen.findByRole("link", {
            name: "Untitled initiative",
        });
        expect(
            screen.getByRole("button", {
                name: 'Archive "Untitled initiative"',
            }),
        ).toBeInTheDocument();

        await user.click(link);

        const name = await screen.findByRole("textbox", {
            name: "Initiative name",
        });
        expect(name).toHaveValue("   ");
        expect(
            within(
                screen.getByRole("navigation", { name: "breadcrumb" }),
            ).getByText("Untitled initiative"),
        ).toBeInTheDocument();
    });
});
