import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SidebarProvider, useSidebar } from "./sidebar";

function SidebarState() {
    const { state } = useSidebar();
    return <output aria-label="Sidebar state">{state}</output>;
}

function renderSidebar() {
    render(
        <SidebarProvider>
            <SidebarState />
        </SidebarProvider>,
    );
    return screen.getByRole("status", { name: "Sidebar state" });
}

describe("SidebarProvider keyboard shortcut", () => {
    it("does not toggle the sidebar on Cmd+B, which the notes editor uses for bold", async () => {
        const user = userEvent.setup();
        const state = renderSidebar();

        await user.keyboard("{Meta>}b{/Meta}");

        expect(state).toHaveTextContent("expanded");
    });

    it("toggles the sidebar on Ctrl+Cmd+S", async () => {
        const user = userEvent.setup();
        const state = renderSidebar();

        await user.keyboard("{Control>}{Meta>}s{/Meta}{/Control}");
        expect(state).toHaveTextContent("collapsed");

        await user.keyboard("{Control>}{Meta>}s{/Meta}{/Control}");
        expect(state).toHaveTextContent("expanded");
    });
});
