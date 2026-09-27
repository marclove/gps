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

function column(name: "Now" | "Next" | "Later" | "Done") {
    return screen.getByRole("region", { name });
}

/** The text of each card in the column, from the top. */
function cardTexts(name: "Now" | "Next" | "Later" | "Done"): string[] {
    return within(column(name))
        .queryAllByRole("button")
        .map((card) => card.textContent ?? "");
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
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
        expect(cardTexts("Now")).toEqual(["Launch"]);
    });
});

describe("Creating an initiative", () => {
    it("creates it at the top of Later and opens its sheet with the name field focused", async () => {
        backend.seedInitiative({ name: "Pilot", horizon: "later" });
        const user = await openInitiativesPage();
        await waitFor(() => expect(cardTexts("Later")).toEqual(["Pilot"]));

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
        expect(name).toHaveValue("");
        expect(name).toHaveAttribute("placeholder", "Untitled initiative");
        expect(
            within(sheet).getByRole("combobox", { name: "RACI role" }),
        ).toHaveValue("");
        expect(cardTexts("Later")).toEqual(["Untitled initiative", "Pilot"]);
        expect(backend.column("later")).toEqual(["", "Pilot"]);
    });

    it("disables the button while the initiative is being created", async () => {
        const user = await openInitiativesPage();
        let finish: () => void = () => {};
        invoke.mockImplementation((command: string, args) =>
            command === "create_initiative"
                ? new Promise((resolve) => {
                      finish = () => resolve(backend.handle(command, args));
                  })
                : backend.handle(command, args),
        );
        const button = screen.getByRole("button", { name: "New initiative" });

        await user.click(button);

        expect(button).toBeDisabled();
        finish();
        expect(
            await screen.findByRole("dialog", { name: "Untitled initiative" }),
        ).toBeInTheDocument();
    });

    it("shows a failure toast and opens no sheet when the initiative cannot be created", async () => {
        backend.failing.add("create_initiative");
        const user = await openInitiativesPage();
        const button = screen.getByRole("button", { name: "New initiative" });

        await user.click(button);

        expect(
            await within(notifications()).findByText(
                "Couldn't create the initiative. Try again.",
            ),
        ).toBeInTheDocument();
        expect(button).toBeEnabled();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
