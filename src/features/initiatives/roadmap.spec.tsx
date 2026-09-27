import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeRoadmapBackend } from "@/test/fake-roadmap-backend";

// Feature spec for the section, the roadmap, and creating an initiative in
// docs/specs/0006-managing-initiatives.md.
// The Tauri backend is replaced by an in-memory fake of the meeting and initiative commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeRoadmapBackend;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeRoadmapBackend();
    invoke.mockImplementation(backend.handle);
});

type User = ReturnType<typeof userEvent.setup>;

function mainNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

async function openInitiativesPage(): Promise<User> {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
        within(mainNavigation()).getByRole("link", { name: "Initiatives" }),
    );
    await screen.findByRole("button", { name: "New initiative" });
    return user;
}

/**
 * Options for queries of the board. While the sheet is open, the board is behind a modal
 * dialog, which hides it from the accessibility tree, so such queries pass `hidden: true`.
 */
type BoardQuery = { hidden?: boolean };

function column(
    name: "Now" | "Next" | "Later" | "Done",
    { hidden = false }: BoardQuery = {},
) {
    return screen.getByRole("region", { name, hidden });
}

/** The text of each card in the column, from the top. */
function cardTexts(
    name: "Now" | "Next" | "Later" | "Done",
    { hidden = false }: BoardQuery = {},
): string[] {
    return within(column(name, { hidden }))
        .queryAllByRole("button", { hidden })
        .map((card) => card.textContent ?? "");
}

describe("Initiatives section", () => {
    it("has a link below Meetings that opens the Initiatives page and is marked as current", async () => {
        const user = userEvent.setup();
        render(<App />);

        const links = within(mainNavigation()).getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual([
            "Meetings",
            "Initiatives",
        ]);
        expect(
            await screen.findByRole("button", { name: "New note" }),
        ).toBeInTheDocument();

        await user.click(links[1]);

        expect(
            await screen.findByRole("button", { name: "New initiative" }),
        ).toBeInTheDocument();
        expect(links[1]).toHaveAttribute("aria-current", "page");
        expect(
            within(
                screen.getByRole("navigation", { name: "breadcrumb" }),
            ).getByText("Initiatives"),
        ).toBeInTheDocument();
    });
});

describe("Roadmap", () => {
    it("shows the four columns in order, with their names and counts", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.seedInitiative({ name: "Pilot", horizon: "next" });
        backend.seedInitiative({ name: "Migration", horizon: "next" });
        await openInitiativesPage();

        await waitFor(() => expect(cardTexts("Now")).toEqual(["Launch"]));
        const regions = ["Now", "Next", "Later", "Done"].map((name) =>
            screen.getByRole("region", { name }),
        );
        for (let i = 1; i < regions.length; i++) {
            expect(
                regions[i - 1].compareDocumentPosition(regions[i]) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        }
        expect(within(column("Next")).getByRole("heading").textContent).toMatch(
            /^Next\s*2$/,
        );
        expect(within(column("Done")).getByRole("heading").textContent).toMatch(
            /^Done\s*0$/,
        );
    });

    it("orders Now, Next, and Later by the user's order, and Done by completion, newest first", async () => {
        backend.seedInitiative({ name: "B", horizon: "later" });
        backend.seedInitiative({ name: "A", horizon: "later" });
        backend.seedInitiative({ name: "C", horizon: "later" });
        backend.seedInitiative({ name: "Old win", completed: true });
        backend.seedInitiative({ name: "New win", completed: true });
        await openInitiativesPage();

        await waitFor(() =>
            expect(cardTexts("Later")).toEqual(["B", "A", "C"]),
        );
        expect(cardTexts("Done")).toEqual(["New win", "Old win"]);
    });

    it("says No initiatives in an empty column", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        await openInitiativesPage();

        await waitFor(() => expect(cardTexts("Now")).toEqual(["Launch"]));
        expect(
            within(column("Now")).queryByText("No initiatives"),
        ).not.toBeInTheDocument();
        for (const name of ["Next", "Later", "Done"] as const) {
            expect(
                within(column(name)).getByText("No initiatives"),
            ).toBeInTheDocument();
        }
    });

    it("does not show deleted initiatives", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.seedInitiative({
            name: "Gone",
            horizon: "now",
            archived: true,
        });
        backend.seedInitiative({
            name: "Gone too",
            completed: true,
            archived: true,
        });
        await openInitiativesPage();

        await waitFor(() => expect(cardTexts("Now")).toEqual(["Launch"]));
        expect(cardTexts("Done")).toEqual([]);
        expect(invoke).toHaveBeenCalledWith("list_initiatives", {
            includeArchived: false,
        });
    });

    it("shows Untitled initiative for an empty name, and the role when there is one", async () => {
        backend.seedInitiative({ name: "", horizon: "now" });
        backend.seedInitiative({
            name: "Launch",
            horizon: "now",
            raciRole: "accountable",
        });
        await openInitiativesPage();

        const untitled = await within(column("Now")).findByRole("button", {
            name: /^Untitled initiative/,
        });
        expect(untitled).toBeInTheDocument();
        const launch = within(column("Now")).getByRole("button", {
            name: /^Launch/,
        });
        expect(within(launch).getByText("Accountable")).toBeInTheDocument();
    });

    it("says so when the initiatives cannot be loaded, and loads them again on Retry", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.failingOnce.add("list_initiatives");
        const user = await openInitiativesPage();

        expect(
            await screen.findByText("Couldn't load initiatives"),
        ).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(cardTexts("Now")).toEqual(["Launch"]));
        expect(
            screen.queryByText("Couldn't load initiatives"),
        ).not.toBeInTheDocument();
    });

    it("opens the sheet of an initiative when its card is clicked", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const user = await openInitiativesPage();

        await user.click(
            await within(column("Now")).findByRole("button", {
                name: /^Launch/,
            }),
        );

        const sheet = await screen.findByRole("dialog", { name: "Launch" });
        expect(
            within(sheet).getByRole("textbox", { name: "Initiative name" }),
        ).toHaveValue("Launch");
    });

    it("opens the sheet of an initiative when Enter is pressed on its card", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const user = await openInitiativesPage();
        const card = await within(column("Now")).findByRole("button", {
            name: /^Launch/,
        });

        card.focus();
        await user.keyboard("{Enter}");

        expect(
            await screen.findByRole("dialog", { name: "Launch" }),
        ).toBeInTheDocument();
        expect(cardTexts("Now", { hidden: true })).toEqual(["Launch"]);
    });
});

describe("Creating an initiative", () => {
    function createCalls() {
        return invoke.mock.calls.filter(
            ([command]) => command === "create_initiative",
        );
    }

    async function openDraft(user: User) {
        await user.click(
            screen.getByRole("button", { name: "New initiative" }),
        );
        const sheet = await screen.findByRole("dialog", {
            name: "Untitled initiative",
        });
        const name = within(sheet).getByRole("textbox", {
            name: "Initiative name",
        });
        await waitFor(() => expect(name).toHaveFocus());
        return { sheet, name };
    }

    it("opens a draft with the name field focused, and saves nothing", async () => {
        backend.seedInitiative({ name: "Pilot", horizon: "later" });
        const user = await openInitiativesPage();
        await waitFor(() => expect(cardTexts("Later")).toEqual(["Pilot"]));

        const { sheet, name } = await openDraft(user);

        expect(name).toHaveValue("");
        expect(name).toHaveAttribute("placeholder", "Untitled initiative");
        expect(
            within(sheet).getByRole("combobox", { name: "RACI role" }),
        ).toHaveValue("");
        expect(
            within(sheet).queryByRole("button", { name: "Delete" }),
        ).not.toBeInTheDocument();
        expect(
            within(sheet).getByRole("button", { name: "Save" }),
        ).toBeEnabled();
        expect(cardTexts("Later", { hidden: true })).toEqual(["Pilot"]);
        expect(createCalls()).toHaveLength(0);
    });

    it("saves nothing when the draft closes without a real change, and gives focus back to New initiative", async () => {
        backend.seedInitiative({ name: "Pilot", horizon: "later" });
        const user = await openInitiativesPage();
        await waitFor(() => expect(cardTexts("Later")).toEqual(["Pilot"]));
        const { name } = await openDraft(user);

        // Spaces alone are not a name.
        await user.type(name, "   ");
        await user.keyboard("{Escape}");

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: "New initiative" }),
            ).toHaveFocus(),
        );
        expect(cardTexts("Later")).toEqual(["Pilot"]);
        expect(createCalls()).toHaveLength(0);
        expect(backend.initiatives).toHaveLength(1);
    });

    it("creates the initiative at the top of Later after the first change, and then edits it", async () => {
        backend.seedInitiative({ name: "Pilot", horizon: "later" });
        const user = await openInitiativesPage();
        await waitFor(() => expect(cardTexts("Later")).toEqual(["Pilot"]));
        const { sheet, name } = await openDraft(user);

        await user.type(name, "Launch");

        expect(await within(sheet).findByText("Saved")).toBeInTheDocument();
        expect(backend.column("later")).toEqual(["Launch", "Pilot"]);
        expect(cardTexts("Later", { hidden: true })).toEqual([
            "Launch",
            "Pilot",
        ]);
        expect(
            screen.getByRole("dialog", { name: "Launch" }),
        ).toBeInTheDocument();
        expect(
            within(sheet).getByRole("button", { name: "Delete" }),
        ).toBeInTheDocument();

        await user.type(name, " v2");

        await waitFor(() =>
            expect(backend.column("later")).toEqual(["Launch v2", "Pilot"]),
        );
        expect(createCalls()).toHaveLength(1);
    });

    it("saves a change that is still waiting when the draft closes", async () => {
        const user = await openInitiativesPage();
        const { name } = await openDraft(user);

        await user.type(name, "Launch");
        await user.keyboard("{Escape}");

        await waitFor(() => expect(cardTexts("Later")).toEqual(["Launch"]));
        expect(backend.column("later")).toEqual(["Launch"]);
    });

    it("creates a draft that has only a role, with an empty name", async () => {
        const user = await openInitiativesPage();
        const { sheet } = await openDraft(user);

        await user.selectOptions(
            within(sheet).getByRole("combobox", { name: "RACI role" }),
            "Informed",
        );

        await waitFor(() =>
            expect(cardTexts("Later", { hidden: true })).toEqual([
                "Untitled initiativeInformed",
            ]),
        );
        expect(backend.initiatives[0]).toMatchObject({
            name: "",
            raciRole: "informed",
        });
    });

    it("does not save a draft whose only change is a name that is taken", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const user = await openInitiativesPage();
        const { sheet, name } = await openDraft(user);

        await user.type(name, "launch");

        expect(
            await within(sheet).findByText(
                'Another initiative is named "launch".',
            ),
        ).toBeInTheDocument();
        expect(backend.initiatives).toHaveLength(1);
        expect(cardTexts("Later", { hidden: true })).toEqual([]);
    });

    it("saves a draft with a taken name and a role, without the name", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const user = await openInitiativesPage();
        const { sheet, name } = await openDraft(user);

        await user.type(name, "launch");
        await user.selectOptions(
            within(sheet).getByRole("combobox", { name: "RACI role" }),
            "Consulted",
        );

        await waitFor(() => expect(backend.initiatives).toHaveLength(2));
        expect(backend.initiatives[1]).toMatchObject({
            name: "",
            raciRole: "consulted",
        });
        expect(
            within(sheet).getByText('Another initiative is named "launch".'),
        ).toBeInTheDocument();
    });

    it("shows Couldn't save when the draft cannot be saved, and saves it on Retry", async () => {
        backend.failingOnce.add("create_initiative");
        const user = await openInitiativesPage();
        const { sheet, name } = await openDraft(user);

        await user.type(name, "Launch");

        expect(
            await within(sheet).findByText("Couldn't save"),
        ).toBeInTheDocument();
        await user.click(within(sheet).getByRole("button", { name: "Retry" }));

        expect(await within(sheet).findByText("Saved")).toBeInTheDocument();
        expect(backend.column("later")).toEqual(["Launch"]);
    });
});
