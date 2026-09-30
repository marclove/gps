import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeBackend } from "@/test/fake-backend";

// Feature spec for the project of an initiative, creating an initiative, and the roadmap in
// docs/specs/0008-projects.md, with the changes of
// docs/specs/0009-meetings-cover-several-initiatives.md. Dragging on a filtered roadmap is
// checked in filtered-roadmap.browser.spec.tsx.
// The Tauri backend is replaced by an in-memory fake of the project, meeting, and initiative
// commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

let backend: FakeBackend;

beforeEach(() => {
    invoke.mockReset();
    backend = new FakeBackend();
    invoke.mockImplementation(backend.handle);
});

type User = ReturnType<typeof userEvent.setup>;

/** Autosave waits for a pause, so a save can take longer than the default timeout. */
const SAVE_TIMEOUT = { timeout: 2000 };

type ColumnName = "Now" | "Next" | "Later" | "Done";

function mainNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
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

function column(name: ColumnName, { hidden = false } = {}) {
    return screen.getByRole("region", { name, hidden });
}

/** The initiative name of each card in the column, from the top, without its project. */
function cardTexts(name: ColumnName, { hidden = false } = {}): string[] {
    return within(column(name, { hidden }))
        .queryAllByRole("button", { hidden })
        .map((card) => backend.cardText(card));
}

function filter() {
    return screen.getByRole<HTMLSelectElement>("combobox", {
        name: "Project",
    });
}

function optionTexts(select: HTMLSelectElement): string[] {
    return Array.from(select.options).map((option) => option.text);
}

async function openSheet(user: User, cardName: RegExp, dialogName: string) {
    await user.click(await screen.findByRole("button", { name: cardName }));
    const sheet = await screen.findByRole("dialog", { name: dialogName });
    await waitFor(() => expect(projectSelect(sheet)).toBeEnabled());
    return sheet;
}

function projectSelect(sheet: HTMLElement) {
    return within(sheet).getByRole<HTMLSelectElement>("combobox", {
        name: "Project",
    });
}

async function openDraft(user: User) {
    await user.click(screen.getByRole("button", { name: "New initiative" }));
    const sheet = await screen.findByRole("dialog", {
        name: "Untitled initiative",
    });
    const name = within(sheet).getByRole("textbox", {
        name: "Initiative name",
    });
    await waitFor(() => expect(name).toHaveFocus());
    return { sheet, name };
}

describe("The roadmap", () => {
    it("shows the name of its project on each card, after the name of the initiative", async () => {
        const checkout = backend.seedProject("Checkout");
        const untitled = backend.seedProject("");
        backend.seedInitiative({
            name: "Launch",
            horizon: "now",
            project: checkout,
        });
        backend.seedInitiative({
            name: "Pilot",
            horizon: "now",
            project: untitled,
        });
        await openInitiativesPage();

        const launch = await within(column("Now")).findByRole("button", {
            name: /^Launch/,
        });
        expect(within(launch).getByText("Checkout")).toBeInTheDocument();
        const pilot = within(column("Now")).getByRole("button", {
            name: /^Pilot/,
        });
        expect(within(pilot).getByText("Untitled project")).toBeInTheDocument();
    });

    it("offers All projects and the projects that are not deleted, by name, before New initiative", async () => {
        backend.seedProject("checkout");
        backend.seedProject("Billing");
        backend.seedProject("Old", { deleted: true });
        await openInitiativesPage();

        await waitFor(() =>
            expect(optionTexts(filter())).toEqual([
                "All projects",
                "Billing",
                "checkout",
            ]),
        );
        expect(filter().selectedOptions[0].text).toBe("All projects");
        expect(
            filter().compareDocumentPosition(
                screen.getByRole("button", { name: "New initiative" }),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("shows only the cards of the chosen project, with counts and empty columns that match", async () => {
        const checkout = backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        backend.seedInitiative({
            name: "Launch",
            horizon: "now",
            project: checkout,
        });
        backend.seedInitiative({
            name: "Invoices",
            horizon: "now",
            project: billing,
        });
        backend.seedInitiative({
            name: "Refunds",
            horizon: "now",
            project: checkout,
        });
        backend.seedInitiative({
            name: "Dunning",
            horizon: "next",
            project: billing,
        });
        const user = await openInitiativesPage();
        await waitFor(() =>
            expect(cardTexts("Now")).toEqual(["Launch", "Invoices", "Refunds"]),
        );

        await user.selectOptions(filter(), "Checkout");

        expect(cardTexts("Now")).toEqual(["Launch", "Refunds"]);
        expect(within(column("Now")).getByRole("heading").textContent).toMatch(
            /^Now\s*2$/,
        );
        expect(cardTexts("Next")).toEqual([]);
        expect(
            within(column("Next")).getByText("No initiatives"),
        ).toBeInTheDocument();

        await user.selectOptions(filter(), "All projects");

        expect(cardTexts("Now")).toEqual(["Launch", "Invoices", "Refunds"]);
        expect(cardTexts("Next")).toEqual(["Dunning"]);
    });

    it("goes back to All projects when the user leaves the page", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedProject("Billing");
        backend.seedInitiative({ name: "Launch", project: checkout });
        const user = await openInitiativesPage();
        await waitFor(() => expect(optionTexts(filter())).toHaveLength(3));
        await user.selectOptions(filter(), "Checkout");

        await user.click(
            within(mainNavigation()).getByRole("link", { name: "Meetings" }),
        );
        await user.click(
            within(mainNavigation()).getByRole("link", {
                name: "Initiatives",
            }),
        );

        await waitFor(() =>
            expect(filter().selectedOptions[0].text).toBe("All projects"),
        );
    });
});

describe("The project of an initiative", () => {
    it("shows the project of a saved initiative, with the projects that are not deleted and no empty choice", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedProject("billing");
        backend.seedProject("Old", { deleted: true });
        backend.seedInitiative({ name: "Launch", project: checkout });
        const user = await openInitiativesPage();

        const sheet = await openSheet(user, /^Launch/, "Launch");

        expect(optionTexts(projectSelect(sheet))).toEqual([
            "billing",
            "Checkout",
        ]);
        expect(projectSelect(sheet)).toHaveValue(String(checkout.id));
    });

    it("moves the initiative and its meetings to another project at once, and keeps its place", async () => {
        const checkout = backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        backend.seedInitiative({
            name: "First",
            horizon: "now",
            project: checkout,
        });
        const launch = backend.seedInitiative({
            name: "Launch",
            horizon: "now",
            project: checkout,
        });
        const meeting = backend.seedMeeting("Kickoff", [launch.id]);
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");

        await user.selectOptions(projectSelect(sheet), "Billing");

        expect(invoke).toHaveBeenCalledWith("set_initiative_project", {
            id: launch.id,
            projectId: billing.id,
        });
        await waitFor(() => expect(launch.projectId).toBe(billing.id));
        expect(meeting.projectId).toBe(billing.id);
        expect(backend.column("now")).toEqual(["First", "Launch"]);
        const card = within(column("Now", { hidden: true })).getByRole(
            "button",
            { name: /^Launch/, hidden: true },
        );
        await waitFor(() =>
            expect(within(card).getByText("Billing")).toBeInTheDocument(),
        );
    });

    it("does not move the initiative when the other project has its name, and says so", async () => {
        const checkout = backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        backend.seedInitiative({ name: "launch", project: billing });
        const launch = backend.seedInitiative({
            name: "Launch",
            project: checkout,
        });
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");

        await user.selectOptions(projectSelect(sheet), "Billing");

        expect(
            await within(sheet).findByText(
                'Another initiative in "Billing" is named "Launch".',
            ),
        ).toBeInTheDocument();
        expect(projectSelect(sheet)).toHaveValue(String(checkout.id));
        expect(launch.projectId).toBe(checkout.id);
    });

    it("goes back and shows a failure toast when the move fails", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedProject("Billing");
        backend.seedInitiative({ name: "Launch", project: checkout });
        backend.failing.add("set_initiative_project");
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");

        await user.selectOptions(projectSelect(sheet), "Billing");

        expect(
            await within(notifications()).findByText(
                "Couldn't move the initiative to the project. Try again.",
            ),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(projectSelect(sheet)).toHaveValue(String(checkout.id)),
        );
    });

    it("takes the card off a filtered roadmap when the initiative moves to another project", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedProject("Billing");
        backend.seedInitiative({
            name: "Launch",
            horizon: "now",
            project: checkout,
        });
        const user = await openInitiativesPage();
        await waitFor(() => expect(optionTexts(filter())).toHaveLength(3));
        await user.selectOptions(filter(), "Checkout");
        const sheet = await openSheet(user, /^Launch/, "Launch");

        await user.selectOptions(projectSelect(sheet), "Billing");
        await user.keyboard("{Escape}");

        await waitFor(() => expect(cardTexts("Now")).toEqual([]));
    });

    it("lets two projects each have an initiative with the same name", async () => {
        const checkout = backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        backend.seedInitiative({ name: "Launch", project: checkout });
        const pilot = backend.seedInitiative({
            name: "Pilot",
            project: billing,
        });
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Pilot/, "Pilot");
        const name = within(sheet).getByRole("textbox", {
            name: "Initiative name",
        });

        await user.clear(name);
        await user.type(name, "Launch");

        await waitFor(() => expect(pilot.name).toBe("Launch"), SAVE_TIMEOUT);
        expect(
            within(sheet).queryByText(/Another initiative/),
        ).not.toBeInTheDocument();
    });

    it("keeps an initiative deleted when Undo comes after its project was deleted", async () => {
        const checkout = backend.seedProject("Checkout");
        const launch = backend.seedInitiative({
            name: "Launch",
            horizon: "now",
            project: checkout,
        });
        const user = await openInitiativesPage();
        const sheet = await openSheet(user, /^Launch/, "Launch");
        await user.click(within(sheet).getByRole("button", { name: "Delete" }));
        await within(notifications()).findByText('Deleted "Launch".');
        // The project is deleted in the meantime, for example from the Projects page.
        checkout.deletedAt = "2026-09-28T10:00:00.000Z";

        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        expect(
            await within(notifications()).findByText(
                'Couldn\'t restore "Launch" because its project is deleted.',
            ),
        ).toBeInTheDocument();
        expect(
            within(notifications()).queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument();
        expect(launch.deletedAt).not.toBeNull();
    });
});

describe("Creating an initiative", () => {
    it("starts the draft on the empty choice when there are several projects, and saves it only with a project", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedProject("Billing");
        const user = await openInitiativesPage();
        const { sheet, name } = await openDraft(user);
        await waitFor(() =>
            expect(optionTexts(projectSelect(sheet))).toEqual([
                "",
                "Billing",
                "Checkout",
            ]),
        );
        expect(projectSelect(sheet)).toHaveValue("");

        await user.type(name, "Launch");
        await new Promise((resolve) => setTimeout(resolve, 800));
        expect(backend.initiatives).toHaveLength(0);

        await user.selectOptions(projectSelect(sheet), "Checkout");

        await waitFor(
            () =>
                expect(backend.initiatives).toEqual([
                    expect.objectContaining({
                        name: "Launch",
                        projectId: checkout.id,
                    }),
                ]),
            SAVE_TIMEOUT,
        );
        expect(await within(sheet).findByText("Saved")).toBeInTheDocument();
    });

    it("does not save a draft whose only change is its project", async () => {
        backend.seedProject("Checkout");
        backend.seedProject("Billing");
        const user = await openInitiativesPage();
        const { sheet } = await openDraft(user);
        await waitFor(() => expect(projectSelect(sheet)).toBeEnabled());

        await user.selectOptions(projectSelect(sheet), "Checkout");
        await new Promise((resolve) => setTimeout(resolve, 800));

        expect(backend.initiatives).toHaveLength(0);
    });

    it("asks for a project when the draft has a name and no project, and keeps the sheet open on Save", async () => {
        backend.seedProject("Checkout");
        backend.seedProject("Billing");
        const user = await openInitiativesPage();
        const { sheet, name } = await openDraft(user);
        await waitFor(() => expect(projectSelect(sheet)).toBeEnabled());

        await user.type(name, "Launch");

        const message = within(sheet).getByText(
            "Choose a project to save this initiative.",
        );
        expect(projectSelect(sheet)).toHaveAttribute("aria-invalid", "true");
        expect(projectSelect(sheet)).toHaveAccessibleDescription(
            message.textContent ?? "",
        );

        await user.click(within(sheet).getByRole("button", { name: "Save" }));

        expect(sheet).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toBe(sheet);
        expect(projectSelect(sheet)).toHaveFocus();
        await new Promise((resolve) => setTimeout(resolve, 800));
        expect(backend.initiatives).toHaveLength(0);
    });

    it("starts the draft in the only project when exactly one exists", async () => {
        const checkout = backend.seedProject("Checkout");
        const user = await openInitiativesPage();

        const { sheet } = await openDraft(user);

        await waitFor(() =>
            expect(projectSelect(sheet)).toHaveValue(String(checkout.id)),
        );
    });

    it("starts the draft in the project of the filter", async () => {
        backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        const user = await openInitiativesPage();
        await waitFor(() => expect(optionTexts(filter())).toHaveLength(3));
        await user.selectOptions(filter(), "Billing");

        const { sheet, name } = await openDraft(user);

        await waitFor(() =>
            expect(projectSelect(sheet)).toHaveValue(String(billing.id)),
        );
        await user.type(name, "Invoices");
        await waitFor(
            () =>
                expect(backend.initiatives[0]).toMatchObject({
                    projectId: billing.id,
                }),
            SAVE_TIMEOUT,
        );
        await waitFor(() =>
            expect(cardTexts("Later", { hidden: true })).toEqual(["Invoices"]),
        );
    });

    it("says to create a project first when none exists, with a link to Projects", async () => {
        const user = await openInitiativesPage();
        const { sheet } = await openDraft(user);

        await waitFor(() =>
            expect(
                within(sheet).getByText(/Create a project first\./),
            ).toBeInTheDocument(),
        );
        expect(projectSelect(sheet)).toBeDisabled();

        await user.click(within(sheet).getByRole("link", { name: "Projects" }));

        expect(
            await screen.findByRole("button", { name: "New project" }),
        ).toBeInTheDocument();
    });
});
