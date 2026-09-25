import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

const invoke = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("App", () => {
    it("opens on the Meetings page inside the application shell", () => {
        render(<App />);

        expect(
            within(screen.getByRole("navigation", { name: "Main" })).getByRole(
                "link",
                { name: "Meetings" },
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("navigation", { name: "breadcrumb" }),
        ).toHaveTextContent("Meetings");
    });

    it("lets the user drag the window by the page header and the sidebar header", () => {
        render(<App />);

        const pageHeader = screen
            .getByRole("navigation", { name: "breadcrumb" })
            .closest("header");
        const sidebarHeader = screen
            .getByText("gps")
            .closest('[data-sidebar="header"]');

        expect(pageHeader).toHaveAttribute("data-tauri-drag-region", "deep");
        expect(sidebarHeader).toHaveAttribute("data-tauri-drag-region", "deep");
    });

    it("keeps the page header clear of the window controls whether or not the sidebar is shown", async () => {
        const user = userEvent.setup();
        render(<App />);
        const pageHeader = screen
            .getByRole("navigation", { name: "breadcrumb" })
            .closest("header");
        expect(pageHeader).toHaveClass("pl-24");

        await user.click(
            screen.getByRole("button", { name: "Toggle Sidebar" }),
        );

        expect(pageHeader).toHaveClass("pl-24");
    });

    it("moves the sidebar button to the page header while the sidebar is hidden", async () => {
        const user = userEvent.setup();
        render(<App />);
        const sidebarHeader = screen
            .getByText("gps")
            .closest('[data-sidebar="header"]') as HTMLElement;
        const pageHeader = screen
            .getByRole("navigation", { name: "breadcrumb" })
            .closest("header") as HTMLElement;

        await user.click(
            within(sidebarHeader).getByRole("button", {
                name: "Toggle Sidebar",
            }),
        );
        await user.click(
            within(pageHeader).getByRole("button", { name: "Toggle Sidebar" }),
        );

        expect(
            within(sidebarHeader).getByRole("button", {
                name: "Toggle Sidebar",
            }),
        ).toBeInTheDocument();
        expect(
            within(pageHeader).queryByRole("button", {
                name: "Toggle Sidebar",
            }),
        ).not.toBeInTheDocument();
    });
});
