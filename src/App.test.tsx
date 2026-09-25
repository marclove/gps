import { render, screen, within } from "@testing-library/react";
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
});
