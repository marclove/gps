import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { FakeBackend } from "@/test/fake-backend";

// Feature spec for the section, the Projects page, creating a project, unique project names,
// and deleting a project in docs/specs/0008-projects.md.
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

function mainNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

function projectsLink() {
    return within(mainNavigation()).getByRole("link", { name: "Projects" });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

async function openProjectsPage(): Promise<User> {
    const user = userEvent.setup();
    render(<App />);
    await user.click(projectsLink());
    await screen.findByRole("heading", { name: "Projects" });
    return user;
}

/** The names that the list of projects shows, from the top. */
function listedNames(): string[] {
    const main = screen.getByRole("main");
    return (
        within(main)
            .queryAllByRole("link")
            // The breadcrumb is a list too, so its items are left out.
            .filter(
                (link) =>
                    link.closest("li") !== null && link.closest("nav") === null,
            )
            .map((link) => link.textContent ?? "")
    );
}

async function openDraft(user: User) {
    await user.click(screen.getByRole("button", { name: "New project" }));
    const name = await screen.findByRole("textbox", { name: "Project name" });
    await waitFor(() => expect(name).toHaveFocus());
    return name;
}

function details() {
    return screen.getByRole("complementary", { name: "Project details" });
}

describe("Projects section", () => {
    it("has a link at the bottom with a tooltip, and the application still opens on Meetings", async () => {
        const user = userEvent.setup();
        render(<App />);

        const links = within(mainNavigation()).getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual([
            "Work",
            "Meetings",
            "Initiatives",
            "Projects",
        ]);
        expect(projectsLink().querySelector("svg")).toBeInTheDocument();
        expect(
            await screen.findByRole("button", { name: "New note" }),
        ).toBeInTheDocument();

        await user.hover(projectsLink());
        expect(await screen.findByRole("tooltip")).toHaveTextContent(
            "Projects",
        );
    });

    it("opens the Projects page and marks the link as current, also on a project page", async () => {
        const checkout = backend.seedProject("Checkout");
        const user = await openProjectsPage();

        expect(projectsLink()).toHaveAttribute("aria-current", "page");
        expect(
            within(
                screen.getByRole("navigation", { name: "breadcrumb" }),
            ).getByText("Projects"),
        ).toBeInTheDocument();

        await user.click(await screen.findByRole("link", { name: "Checkout" }));
        await screen.findByRole("textbox", { name: "Project name" });

        expect(projectsLink()).toHaveAttribute("aria-current", "page");
        expect(
            await screen.findByRole("textbox", { name: "Project name" }),
        ).toHaveValue(checkout.name);
    });
});

describe("Projects page", () => {
    it("lists the projects that are not deleted by name without regard to case", async () => {
        backend.seedProject("checkout");
        backend.seedProject("Billing");
        backend.seedProject("Old", { deleted: true });
        backend.seedProject("");
        backend.seedProject("Admin");
        await openProjectsPage();

        await waitFor(() =>
            expect(listedNames()).toEqual([
                "Admin",
                "Billing",
                "checkout",
                "Untitled project",
            ]),
        );
        expect(
            screen.getByRole("button", { name: 'Delete "Billing"' }),
        ).toBeInTheDocument();
    });

    it("says No projects yet when there are none", async () => {
        await openProjectsPage();

        expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    });

    it("says so when the projects cannot be loaded, and loads them again on Retry", async () => {
        backend.seedProject("Checkout");
        backend.failingOnce.add("list_projects");
        const user = await openProjectsPage();

        expect(
            await screen.findByText("Couldn't load projects"),
        ).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(listedNames()).toEqual(["Checkout"]));
    });
});

describe("Creating a project", () => {
    function createCalls() {
        return invoke.mock.calls.filter(
            ([command]) => command === "create_project",
        );
    }

    it("opens a draft with the name focused, empty lists, and nothing saved", async () => {
        const user = await openProjectsPage();

        const name = await openDraft(user);

        expect(name).toHaveValue("");
        expect(name).toHaveAttribute("placeholder", "Untitled project");
        expect(
            screen.getByRole("textbox", { name: "Description" }),
        ).toBeInTheDocument();
        expect(
            within(details()).queryByRole("button", { name: "Delete" }),
        ).not.toBeInTheDocument();
        expect(
            within(details()).getByRole("button", { name: "New initiative" }),
        ).toBeDisabled();
        expect(
            within(details()).getByText("No initiatives"),
        ).toBeInTheDocument();
        expect(within(details()).getByText("No meetings")).toBeInTheDocument();
        expect(screen.queryByText("Saved")).not.toBeInTheDocument();
        expect(createCalls()).toHaveLength(0);
    });

    it("saves the draft after the user types a name, and keeps editing the same project", async () => {
        const user = await openProjectsPage();
        const name = await openDraft(user);

        await user.type(name, "Checkout");

        expect(
            await screen.findByText("Saved", {}, SAVE_TIMEOUT),
        ).toBeInTheDocument();
        expect(backend.projects).toHaveLength(1);
        expect(backend.projects[0]).toMatchObject({ name: "Checkout" });
        expect(
            within(details()).getByRole("button", { name: "Delete" }),
        ).toBeInTheDocument();
        expect(
            within(details()).getByRole("button", { name: "New initiative" }),
        ).toBeEnabled();
        expect(name).toHaveValue("Checkout");
        expect(name).toHaveFocus();

        await user.type(name, " v2");

        await waitFor(
            () => expect(backend.projects[0].name).toBe("Checkout v2"),
            SAVE_TIMEOUT,
        );
        expect(createCalls()).toHaveLength(1);

        await user.click(projectsLink());
        await waitFor(() => expect(listedNames()).toEqual(["Checkout v2"]));
    });

    it("saves a draft that has only a description, with an empty name", async () => {
        const user = await openProjectsPage();
        await openDraft(user);

        await user.click(screen.getByRole("textbox", { name: "Description" }));
        await user.keyboard("Payments and refunds");

        await waitFor(
            () => expect(backend.projects).toHaveLength(1),
            SAVE_TIMEOUT,
        );
        expect(backend.projects[0]).toMatchObject({
            name: "",
            description: "Payments and refunds",
        });
    });

    it("saves a change that is still waiting when the user leaves the draft", async () => {
        const user = await openProjectsPage();
        const name = await openDraft(user);

        await user.type(name, "Checkout");
        await user.click(projectsLink());

        await waitFor(() => expect(listedNames()).toEqual(["Checkout"]));
    });

    it("saves nothing when the user leaves a draft without a real change", async () => {
        const user = await openProjectsPage();
        const name = await openDraft(user);

        // Spaces alone are not a name.
        await user.type(name, "   ");
        await user.click(projectsLink());

        expect(await screen.findByText("No projects yet")).toBeInTheDocument();
        expect(createCalls()).toHaveLength(0);
    });
});

describe("Unique project names", () => {
    it("shows a message when another project has the name, and keeps the saved name", async () => {
        backend.seedProject("Checkout");
        const billing = backend.seedProject("Billing");
        const user = await openProjectsPage();
        await user.click(await screen.findByRole("link", { name: "Billing" }));
        const name = await screen.findByRole("textbox", {
            name: "Project name",
        });
        await waitFor(() => expect(name).toHaveValue("Billing"));

        await user.clear(name);
        await user.type(name, " checkout ");

        expect(
            await screen.findByText(
                'Another project is named "checkout".',
                {},
                SAVE_TIMEOUT,
            ),
        ).toBeInTheDocument();
        expect(name).toHaveAttribute("aria-invalid", "true");
        expect(billing.name).toBe("Billing");
        expect(
            within(
                screen.getByRole("navigation", { name: "breadcrumb" }),
            ).getByText("Billing"),
        ).toBeInTheDocument();
        expect(screen.queryByText("Couldn't save")).not.toBeInTheDocument();

        await user.clear(name);
        await user.type(name, "checkout2");

        await waitFor(
            () => expect(billing.name).toBe("checkout2"),
            SAVE_TIMEOUT,
        );
        expect(
            screen.queryByText('Another project is named "checkout".'),
        ).not.toBeInTheDocument();
    });

    it("accepts the name of a deleted project", async () => {
        backend.seedProject("Checkout", { deleted: true });
        const user = await openProjectsPage();
        const name = await openDraft(user);

        await user.type(name, "Checkout");

        await waitFor(
            () =>
                expect(
                    backend.projects.filter((p) => p.deletedAt === null),
                ).toHaveLength(1),
            SAVE_TIMEOUT,
        );
    });
});

describe("Deleting a project", () => {
    it("deletes a project from its row, and Undo brings it back", async () => {
        backend.seedProject("Billing");
        const checkout = backend.seedProject("Checkout");
        const user = await openProjectsPage();
        await waitFor(() =>
            expect(listedNames()).toEqual(["Billing", "Checkout"]),
        );

        await user.click(
            screen.getByRole("button", { name: 'Delete "Checkout"' }),
        );

        await waitFor(() => expect(listedNames()).toEqual(["Billing"]));
        expect(checkout.deletedAt).not.toBeNull();
        const toast = within(notifications());
        expect(
            await toast.findByText('Deleted "Checkout".'),
        ).toBeInTheDocument();

        await user.click(toast.getByRole("button", { name: "Undo" }));

        await waitFor(() =>
            expect(listedNames()).toEqual(["Billing", "Checkout"]),
        );
        expect(checkout.deletedAt).toBeNull();
    });

    it("deletes a project from its page, saves waiting changes first, and focuses New project", async () => {
        const checkout = backend.seedProject("Checkout");
        const user = await openProjectsPage();
        await user.click(await screen.findByRole("link", { name: "Checkout" }));
        const name = await screen.findByRole("textbox", {
            name: "Project name",
        });
        await waitFor(() => expect(name).toHaveValue("Checkout"));

        await user.type(name, " v2");
        await user.click(
            within(details()).getByRole("button", { name: "Delete" }),
        );

        expect(
            await within(notifications()).findByText('Deleted "Checkout v2".'),
        ).toBeInTheDocument();
        expect(checkout).toMatchObject({ name: "Checkout v2" });
        expect(checkout.deletedAt).not.toBeNull();
        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: "New project" }),
            ).toHaveFocus(),
        );
        expect(screen.getByText("No projects yet")).toBeInTheDocument();
    });

    it("refuses to delete a project that still has initiatives, also completed ones", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedInitiative({
            name: "Launch",
            project: checkout,
            completed: true,
        });
        const user = await openProjectsPage();

        await user.click(
            await screen.findByRole("button", { name: 'Delete "Checkout"' }),
        );

        expect(
            await within(notifications()).findByText(
                'Couldn\'t delete "Checkout" because it still has initiatives.',
            ),
        ).toBeInTheDocument();
        expect(checkout.deletedAt).toBeNull();
        expect(listedNames()).toEqual(["Checkout"]);
        expect(
            within(notifications()).queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument();
    });

    it("refuses on the project page too, and the page stays open", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedInitiative({ name: "Launch", project: checkout });
        const user = await openProjectsPage();
        await user.click(await screen.findByRole("link", { name: "Checkout" }));
        await screen.findByRole("textbox", { name: "Project name" });

        await user.click(
            within(details()).getByRole("button", { name: "Delete" }),
        );

        expect(
            await within(notifications()).findByText(
                'Couldn\'t delete "Checkout" because it still has initiatives.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("textbox", { name: "Project name" }),
        ).toHaveValue("Checkout");
    });

    it("allows the delete when every initiative of the project is deleted", async () => {
        const checkout = backend.seedProject("Checkout");
        backend.seedInitiative({
            name: "Launch",
            project: checkout,
            deleted: true,
        });
        const user = await openProjectsPage();

        await user.click(
            await screen.findByRole("button", { name: 'Delete "Checkout"' }),
        );

        await waitFor(() => expect(checkout.deletedAt).not.toBeNull());
    });

    it("says so when the delete fails", async () => {
        backend.seedProject("Checkout");
        backend.failing.add("delete_project");
        const user = await openProjectsPage();

        await user.click(
            await screen.findByRole("button", { name: 'Delete "Checkout"' }),
        );

        expect(
            await within(notifications()).findByText(
                "Couldn't delete the project. Try again.",
            ),
        ).toBeInTheDocument();
        expect(listedNames()).toEqual(["Checkout"]);
    });

    it("keeps the project deleted when another project has its name by then", async () => {
        const first = backend.seedProject("Checkout");
        const user = await openProjectsPage();
        await user.click(
            await screen.findByRole("button", { name: 'Delete "Checkout"' }),
        );
        await within(notifications()).findByText('Deleted "Checkout".');
        backend.seedProject("checkout");

        await user.click(
            within(notifications()).getByRole("button", { name: "Undo" }),
        );

        expect(
            await within(notifications()).findByText(
                'Couldn\'t restore "Checkout" because another project has that name.',
            ),
        ).toBeInTheDocument();
        expect(
            within(notifications()).queryByRole("button", { name: "Undo" }),
        ).not.toBeInTheDocument();
        expect(first.deletedAt).not.toBeNull();
    });
});
