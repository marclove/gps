import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesEditor } from "./notes-editor";

describe("NotesEditor", () => {
    it("shows Markdown as formatted text", async () => {
        render(
            <NotesEditor
                initialMarkdown={"## Agenda\n\n**Owner:** Sam\n\n1. Roadmap\n"}
                onChange={() => {}}
            />,
        );
        const notes = await screen.findByRole("textbox", { name: "Notes" });

        expect(
            within(notes).getByRole("heading", { level: 2, name: "Agenda" }),
        ).toBeInTheDocument();
        expect(within(notes).getByText("Owner:").tagName).toBe("STRONG");
        expect(within(notes).getByRole("listitem")).toHaveTextContent(
            "Roadmap",
        );
    });

    it("reports the notes as Markdown after typing", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<NotesEditor initialMarkdown="" onChange={onChange} />);

        await user.type(
            await screen.findByRole("textbox", { name: "Notes" }),
            "Hello",
        );

        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("Hello"));
    });

    it.each([
        ["Bold", "**Decision**"],
        ["Heading 1", "# Decision"],
        ["Heading 2", "## Decision"],
        ["Heading 3", "### Decision"],
        ["Bullet list", "- Decision"],
        ["Numbered list", "1. Decision"],
        ["Task list", "- [ ] Decision"],
    ])("applies %s from the toolbar", async (label, markdown) => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<NotesEditor initialMarkdown="" onChange={onChange} />);
        await user.click(await screen.findByRole("textbox", { name: "Notes" }));

        await user.click(screen.getByRole("button", { name: label }));
        await user.keyboard("Decision");

        await waitFor(() =>
            expect(onChange.mock.lastCall?.[0].trim()).toBe(markdown),
        );
        expect(screen.getByRole("button", { name: label })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });
});
