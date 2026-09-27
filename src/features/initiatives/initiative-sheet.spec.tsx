import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeRoadmapBackend } from "@/test/fake-roadmap-backend";

// Feature spec for the sheet, saving, and deleting an initiative in
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

async function openInitiativesPage(): Promise<User> {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
        within(screen.getByRole("navigation", { name: "Main" })).getByRole(
            "link",
            { name: "Initiatives" },
        ),
    );
    await screen.findByRole("button", { name: "New initiative" });
    return user;
}

function column(name: "Now" | "Next" | "Later" | "Done") {
    return screen.getByRole("region", { name });
}

function cardTexts(name: "Now" | "Next" | "Later" | "Done"): string[] {
    return within(column(name))
        .queryAllByRole("button")
        .map((card) => card.textContent ?? "");
}

function card(name: RegExp) {
    return screen.findByRole("button", { name });
}

async function openSheet(user: User, cardName: RegExp, dialogName: string) {
    await user.click(await card(cardName));
    const sheet = await screen.findByRole("dialog", { name: dialogName });
    await waitFor(() =>
        expect(
            within(sheet).getByRole("textbox", { name: "Initiative name" }),
        ).toBeEnabled(),
    );
    return sheet;
}

function nameField(sheet: HTMLElement) {
    return within(sheet).getByRole("textbox", { name: "Initiative name" });
}

function roleSelect(sheet: HTMLElement) {
    return within(sheet).getByRole<HTMLSelectElement>("combobox", {
        name: "RACI role",
    });
}

function description(sheet: HTMLElement) {
    return within(sheet).getByRole("textbox", { name: "Description" });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

function follows(first: Element, second: Element) {
    return Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
}

describe("The sheet", () => {
    it("shows the name, save status, Close, role, toolbar, description, and Delete, in that order", async () => {
        backend.seedInitiative({
            name: "Launch",
            horizon: "now",
            raciRole: "consulted",
            description: "Ship **v2**",
        });
        const user = await openInitiativesPage();

        const sheet = await openSheet(user, /^Launch/, "Launch");

        const parts = [
            nameField(sheet),
            within(sheet).getByRole("button", { name: "Close" }),
            roleSelect(sheet),
            within(sheet).getByRole("toolbar", { name: "Formatting" }),
            description(sheet),
            within(sheet).getByRole("button", { name: "Delete" }),
        ];
        for (let i = 1; i < parts.length; i++) {
            expect(follows(parts[i - 1], parts[i])).toBe(true);
        }
        expect(nameField(sheet)).toHaveValue("Launch");
        expect(within(sheet).getByText("Role")).toBeInTheDocument();
        expect(roleSelect(sheet)).toHaveValue("consulted");
        expect(within(description(sheet)).getByText("v2").tagName).toBe(
            "STRONG",
        );
        expect(
            within(sheet).queryByText(/^Completed on/),
        ).not.toBeInTheDocument();
    });

    it("offers no role and the four RACI roles, in order", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const user = await openInitiativesPage();

        const sheet = await openSheet(user, /^Launch/, "Launch");

        expect(
            Array.from(roleSelect(sheet).options).map((option) => option.text),
        ).toEqual(["", "Responsible", "Accountable", "Consulted", "Informed"]);
        expect(roleSelect(sheet)).toHaveValue("");
    });

    it("shows when a completed initiative was completed", async () => {
        const done = backend.seedInitiative({
            name: "Launch",
            completed: true,
        });
        const user = await openInitiativesPage();

        const sheet = await openSheet(user, /^Launch/, "Launch");

        const expected = new Date(done.completedAt!).toLocaleDateString(
            "en-US",
            { year: "numeric", month: "long", day: "numeric" },
        );
        expect(
            within(sheet).getByText(`Completed on ${expected}`),
        ).toBeInTheDocument();
    });

    it("closes with the Close button and with Escape, and gives focus back to the card", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const user = await openInitiativesPage();

        const sheet = await openSheet(user, /^Launch/, "Launch");
        await user.click(within(sheet).getByRole("button", { name: "Close" }));
        await waitFor(() =>
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
        expect(await card(/^Launch/)).toHaveFocus();

        await openSheet(user, /^Launch/, "Launch");
        await user.keyboard("{Escape}");
        await waitFor(() =>
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
        expect(await card(/^Launch/)).toHaveFocus();
    });

    it("says so when the initiative cannot be loaded, and loads it again on Retry", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.failingOnce.add("get_initiative");
        const user = await openInitiativesPage();

        await user.click(await card(/^Launch/));
        const sheet = await screen.findByRole("dialog", { name: "Launch" });
        expect(
            await within(sheet).findByText("Couldn't load the initiative"),
        ).toBeInTheDocument();
        await user.click(within(sheet).getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(nameField(sheet)).toHaveValue("Launch"));
        expect(nameField(sheet)).toBeEnabled();
    });
});

describe("Saving", () => {
    it("saves the name, role, and description automatically and updates the card in place", async () => {
        backend.seedInitiative({ name: "Pilot", horizon: "next" });
        backend.seedInitiative({ name: "Launch", horizon: "next" });
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");

        await user.clear(nameField(sheet));
        await user.type(nameField(sheet), "Launch v2");
        await user.selectOptions(roleSelect(sheet), "Accountable");
        await user.click(description(sheet));
        await user.keyboard("Goals");

        expect(await within(sheet).findByText("Saved")).toBeInTheDocument();
        await waitFor(() =>
            expect(backend.find("Launch v2")).toMatchObject({
                raciRole: "accountable",
                description: "Goals",
            }),
        );
        expect(cardTexts("Next")).toEqual(["Pilot", "Launch v2Accountable"]);
        expect(
            screen.getByRole("dialog", { name: "Launch v2" }),
        ).toBeInTheDocument();
    });

    it("saves a pending change when the sheet closes, and shows it when the sheet opens again", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const user = await openInitiativesPage();
        let sheet = await openSheet(user, /^Launch/, "Launch");

        await user.type(nameField(sheet), "!");
        await user.keyboard("{Escape}");

        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith(
                "update_initiative",
                expect.objectContaining({ name: "Launch!" }),
            ),
        );
        await waitFor(() => expect(cardTexts("Now")).toEqual(["Launch!"]));
        sheet = await openSheet(user, /^Launch!/, "Launch!");
        expect(nameField(sheet)).toHaveValue("Launch!");
    });

    it("shows Couldn't save when a save fails, and saves on Retry", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.failingOnce.add("update_initiative");
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");

        await user.type(nameField(sheet), "!");

        expect(
            await within(sheet).findByText("Couldn't save"),
        ).toBeInTheDocument();
        await user.click(within(sheet).getByRole("button", { name: "Retry" }));
        expect(await within(sheet).findByText("Saved")).toBeInTheDocument();
        expect(backend.find("Launch!")).toBeDefined();
    });
});

describe("Deleting an initiative", () => {
    it("closes the sheet, removes the card, focuses New initiative, and shows the delete toast", async () => {
        backend.seedInitiative({ name: "A", horizon: "now" });
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.seedInitiative({ name: "C", horizon: "now" });
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");

        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
        expect(cardTexts("Now")).toEqual(["A", "C"]);
        expect(
            screen.getByRole("button", { name: "New initiative" }),
        ).toHaveFocus();
        const toast = within(notifications());
        expect(toast.getByText('Deleted "Launch".')).toBeInTheDocument();
        expect(toast.getByRole("button", { name: "Undo" })).toBeInTheDocument();
        expect(backend.find("Launch").archivedAt).not.toBeNull();
    });

    it("saves a pending change before deleting, and names the initiative by its latest name", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");

        await user.type(nameField(sheet), " v2");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        expect(
            await within(notifications()).findByText('Deleted "Launch v2".'),
        ).toBeInTheDocument();
        expect(backend.find("Launch v2").archivedAt).not.toBeNull();
    });

    it("restores the initiative to its place on Undo and focuses its card", async () => {
        backend.seedInitiative({ name: "A", horizon: "next" });
        backend.seedInitiative({ name: "Launch", horizon: "next" });
        backend.seedInitiative({ name: "C", horizon: "next" });
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        await user.click(
            await within(notifications()).findByRole("button", {
                name: "Undo",
            }),
        );

        await waitFor(() =>
            expect(cardTexts("Next")).toEqual(["A", "Launch", "C"]),
        );
        expect(await card(/^Launch/)).toHaveFocus();
        expect(backend.column("next")).toEqual(["A", "Launch", "C"]);
    });

    it("restores a completed initiative to Done", async () => {
        backend.seedInitiative({ name: "Launch", completed: true });
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(cardTexts("Done")).toEqual([]));

        await user.click(
            await within(notifications()).findByRole("button", {
                name: "Undo",
            }),
        );

        await waitFor(() => expect(cardTexts("Done")).toEqual(["Launch"]));
    });

    it("keeps the sheet open and shows a failure toast when the delete fails", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        backend.failing.add("archive_initiative");
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");

        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        expect(
            await within(notifications()).findByText(
                "Couldn't delete the initiative. Try again.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("dialog", { name: "Launch" }),
        ).toBeInTheDocument();
        expect(cardTexts("Now")).toEqual(["Launch"]);
    });

    it("says so in the toast when the restore fails, and tries again on Undo", async () => {
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));
        backend.failingOnce.add("unarchive_initiative");

        await user.click(
            await within(notifications()).findByRole("button", {
                name: "Undo",
            }),
        );
        expect(
            await within(notifications()).findByText(
                "Couldn't restore the initiative. Try again.",
            ),
        ).toBeInTheDocument();
        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        await waitFor(() => expect(cardTexts("Now")).toEqual(["Launch"]));
    });

    it("shares one archive toast with meetings", async () => {
        backend.seedMeeting("Weekly sync");
        backend.seedInitiative({ name: "Launch", horizon: "now" });
        const user = userEvent.setup();
        render(<App />);
        await user.click(
            await screen.findByRole("link", { name: /Weekly sync/ }),
        );
        await user.click(
            await screen.findByRole("button", { name: "Archive" }),
        );
        expect(
            await within(notifications()).findByText('Archived "Weekly sync".'),
        ).toBeInTheDocument();

        await user.click(
            within(screen.getByRole("navigation", { name: "Main" })).getByRole(
                "link",
                { name: "Initiatives" },
            ),
        );
        const sheet = await openSheet(user, /^Launch/, "Launch");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));

        expect(
            await within(notifications()).findByText('Deleted "Launch".'),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(
                within(notifications()).queryByText('Archived "Weekly sync".'),
            ).not.toBeInTheDocument(),
        );
        await act(async () => {});
        expect(
            within(notifications()).getAllByRole("button", { name: "Undo" }),
        ).toHaveLength(1);
    });
});
