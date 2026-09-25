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

describe("NotesEditor links", () => {
    // ProseMirror maps "Mod" to Cmd on macOS and to Ctrl elsewhere. jsdom does not
    // report a Mac, so these tests press Ctrl for shortcuts that are Cmd in the app.
    /** Renders the editor with `markdown` and selects all of the notes. */
    async function renderAndSelectAll(markdown: string) {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<NotesEditor initialMarkdown={markdown} onChange={onChange} />);
        await user.click(await screen.findByRole("textbox", { name: "Notes" }));
        await user.keyboard("{Control>}a{/Control}");
        return { onChange, user };
    }

    const lastMarkdown = (onChange: ReturnType<typeof vi.fn>) =>
        onChange.mock.lastCall?.[0].trim();

    it("turns the selected text into a link from the toolbar", async () => {
        const { onChange, user } = await renderAndSelectAll("Roadmap");

        await user.click(screen.getByRole("button", { name: "Link" }));
        await user.keyboard("https://example.com{Enter}");

        await waitFor(() =>
            expect(lastMarkdown(onChange)).toBe(
                "[Roadmap](https://example.com)",
            ),
        );
    });

    it("opens the link popover with Mod+K and focuses the address", async () => {
        const { user } = await renderAndSelectAll("Roadmap");

        await user.keyboard("{Control>}k{/Control}");

        expect(
            await screen.findByRole("textbox", { name: "Link address" }),
        ).toHaveFocus();
    });

    it("adds https:// to an address without a scheme", async () => {
        const { onChange, user } = await renderAndSelectAll("Roadmap");

        await user.click(screen.getByRole("button", { name: "Link" }));
        await user.keyboard("example.com");
        await user.click(screen.getByRole("button", { name: "Apply" }));

        await waitFor(() =>
            expect(lastMarkdown(onChange)).toBe(
                "[Roadmap](https://example.com)",
            ),
        );
    });

    it("shows the address of the current link and changes it", async () => {
        const { onChange, user } = await renderAndSelectAll(
            "[Roadmap](https://old.example.com)",
        );
        expect(screen.getByRole("button", { name: "Link" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );

        await user.click(screen.getByRole("button", { name: "Link" }));
        const address = screen.getByRole("textbox", { name: "Link address" });
        expect(address).toHaveValue("https://old.example.com");
        await user.clear(address);
        await user.keyboard("https://new.example.com{Enter}");

        await waitFor(() =>
            expect(lastMarkdown(onChange)).toBe(
                "[Roadmap](https://new.example.com)",
            ),
        );
    });

    it("removes a link and keeps its text", async () => {
        const { onChange, user } = await renderAndSelectAll(
            "[Roadmap](https://example.com)",
        );

        await user.click(screen.getByRole("button", { name: "Link" }));
        await user.click(screen.getByRole("button", { name: "Remove link" }));

        await waitFor(() => expect(lastMarkdown(onChange)).toBe("Roadmap"));
    });

    it("closes the popover without changes when Escape is pressed", async () => {
        const { onChange, user } = await renderAndSelectAll("Roadmap");

        await user.click(screen.getByRole("button", { name: "Link" }));
        await user.keyboard("https://example.com{Escape}");

        await waitFor(() =>
            expect(
                screen.queryByRole("textbox", { name: "Link address" }),
            ).not.toBeInTheDocument(),
        );
        expect(onChange).not.toHaveBeenCalled();
    });

    it("does not make a link from an unsafe address", async () => {
        const { onChange, user } = await renderAndSelectAll("Roadmap");

        await user.click(screen.getByRole("button", { name: "Link" }));
        await user.keyboard("javascript:alert(1){Enter}");

        expect(onChange).not.toHaveBeenCalled();
    });

    it("keeps the selected text marked while the popover has the focus", async () => {
        const { user } = await renderAndSelectAll("Roadmap");
        const notes = screen.getByRole("textbox", { name: "Notes" });

        await user.click(screen.getByRole("button", { name: "Link" }));

        expect(
            screen.getByRole("textbox", { name: "Link address" }),
        ).toHaveFocus();
        expect(notes.querySelector(".selection")).toHaveTextContent("Roadmap");
    });

    it("disables the Link button when no text is selected", async () => {
        const user = userEvent.setup();
        render(<NotesEditor initialMarkdown="" onChange={() => {}} />);
        await user.click(await screen.findByRole("textbox", { name: "Notes" }));

        expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();
    });

    it("draws links so that the opener plugin opens them in the system browser", async () => {
        render(
            <NotesEditor
                initialMarkdown="[Roadmap](https://example.com)"
                onChange={() => {}}
            />,
        );
        const notes = await screen.findByRole("textbox", { name: "Notes" });

        const link = within(notes).getByRole("link", { name: "Roadmap" });
        expect(link).toHaveAttribute("href", "https://example.com");
        expect(link).toHaveAttribute("target", "_blank");
    });
});
