import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("App", () => {
    it("renders the heading", () => {
        render(<App />);
        expect(
            screen.getByRole("heading", { name: /welcome to tauri \+ react/i }),
        ).toBeInTheDocument();
    });

    it("invokes the greet command with the entered name and shows the result", async () => {
        invoke.mockResolvedValueOnce(
            "Hello, Ada! You've been greeted from Rust!",
        );
        const user = userEvent.setup();
        render(<App />);

        await user.type(screen.getByPlaceholderText(/enter a name/i), "Ada");
        await user.click(screen.getByRole("button", { name: /greet/i }));

        expect(invoke).toHaveBeenCalledWith("greet", { name: "Ada" });
        expect(
            await screen.findByText(
                "Hello, Ada! You've been greeted from Rust!",
            ),
        ).toBeInTheDocument();
    });
});
