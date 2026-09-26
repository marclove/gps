import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

// Feature spec for docs/specs/0006-managing-initiatives.md.
// The Tauri backend is replaced by an in-memory fake of the meeting and initiative commands.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

type RaciRole = "responsible" | "accountable" | "consulted" | "informed";

type Initiative = {
    id: number;
    name: string;
    description: string;
    raciRole: RaciRole | null;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
};

type Meeting = {
    id: number;
    name: string;
    date: string;
    notes: string;
    initiativeId: number | null;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
};

type UpdateArgs = Pick<Initiative, "id" | "name" | "description" | "raciRole">;

class FakeBackend {
    initiatives: Initiative[] = [];
    meetings: Meeting[] = [];
    failNextList = false;
    failCreate = false;
    failNextGet = false;
    failArchive = false;
    failUnarchive = false;
    private nextId = 1;
    private clock = 0;

    /** Returns a new timestamp that is later than every earlier one. */
    private now(): string {
        this.clock += 1;
        return new Date(Date.UTC(2026, 8, 24, 10, 0, this.clock)).toISOString();
    }

    seed(fields: Partial<Initiative> & Pick<Initiative, "name">): Initiative {
        const now = this.now();
        const initiative: Initiative = {
            id: this.nextId++,
            description: "",
            raciRole: null,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            ...fields,
        };
        this.initiatives.push(initiative);
        return initiative;
    }

    seedMeeting(name: string): Meeting {
        const now = this.now();
        const meeting: Meeting = {
            id: this.nextId++,
            name,
            date: "2026-09-24",
            notes: "",
            initiativeId: null,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
        };
        this.meetings.push(meeting);
        return meeting;
    }

    find(id: number): Initiative | undefined {
        return this.initiatives.find((initiative) => initiative.id === id);
    }

    lastUpdate(): UpdateArgs | undefined {
        const updates = invoke.mock.calls
            .filter(([command]) => command === "update_initiative")
            .map(([, args]) => args as UpdateArgs);
        return updates[updates.length - 1];
    }

    private stored(id: unknown): Initiative {
        const initiative = this.find(id as number);
        if (!initiative) throw `initiative ${String(id)} not found`;
        return initiative;
    }

    private storedMeeting(id: unknown): Meeting {
        const meeting = this.meetings.find((m) => m.id === id);
        if (!meeting) throw `meeting ${String(id)} not found`;
        return meeting;
    }

    handle = async (
        command: string,
        args: Record<string, unknown> = {},
    ): Promise<unknown> => {
        switch (command) {
            case "list_meetings":
                return this.meetings
                    .filter((m) => m.archivedAt === null)
                    .map(({ id, name, date, updatedAt }) => ({
                        id,
                        name,
                        date,
                        updatedAt,
                    }));
            case "get_meeting": {
                const meeting = this.meetings.find((m) => m.id === args.id);
                if (!meeting) return null;
                const { id, name, date, notes, initiativeId } = meeting;
                const { createdAt, updatedAt } = meeting;
                return {
                    id,
                    name,
                    date,
                    notes,
                    initiativeId,
                    createdAt,
                    updatedAt,
                };
            }
            case "list_meeting_tasks":
                return [];
            case "archive_meeting":
                this.storedMeeting(args.id).archivedAt ??= this.now();
                return null;
            case "unarchive_meeting":
                this.storedMeeting(args.id).archivedAt = null;
                return null;
            case "list_initiatives": {
                if (this.failNextList) {
                    this.failNextList = false;
                    throw "database is locked";
                }
                return this.initiatives
                    .filter(
                        (initiative) =>
                            args.includeArchived === true ||
                            initiative.archivedAt === null,
                    )
                    .sort(
                        (a, b) =>
                            b.createdAt.localeCompare(a.createdAt) ||
                            b.id - a.id,
                    )
                    .map(({ id, name, raciRole, updatedAt, archivedAt }) => ({
                        id,
                        name,
                        raciRole,
                        updatedAt,
                        archivedAt,
                    }));
            }
            case "create_initiative":
                if (this.failCreate) throw "database is locked";
                return this.seed({ name: "Untitled initiative" });
            case "get_initiative":
                if (this.failNextGet) {
                    this.failNextGet = false;
                    throw "database is locked";
                }
                return this.find(args.id as number) ?? null;
            case "update_initiative": {
                const initiative = this.stored(args.id);
                Object.assign(initiative, {
                    name: args.name,
                    description: args.description,
                    raciRole: args.raciRole,
                    updatedAt: this.now(),
                });
                return initiative;
            }
            case "archive_initiative": {
                if (this.failArchive) throw "database is locked";
                this.stored(args.id).archivedAt ??= this.now();
                return null;
            }
            case "unarchive_initiative": {
                if (this.failUnarchive) throw "database is locked";
                this.stored(args.id).archivedAt = null;
                return null;
            }
            default:
                throw `unexpected command ${command}`;
        }
    };
}

const SAVE_TIMEOUT = { timeout: 2000 };

let backend: FakeBackend;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 24, 10, 0));
    invoke.mockReset();
    backend = new FakeBackend();
    invoke.mockImplementation(backend.handle);
});

afterEach(() => {
    vi.useRealTimers();
});

function renderApp() {
    const user = userEvent.setup();
    render(<App />);
    return user;
}

type User = ReturnType<typeof userEvent.setup>;

function sidebarNavigation() {
    return screen.getByRole("navigation", { name: "Main" });
}

function breadcrumb() {
    return screen.getByRole("navigation", { name: "breadcrumb" });
}

function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

function initiativeDetails() {
    return screen.getByRole("complementary", { name: "Initiative details" });
}

function roleSelect() {
    return within(initiativeDetails()).getByRole<HTMLSelectElement>(
        "combobox",
        { name: "RACI role" },
    );
}

async function openInitiativesPage(user: User) {
    await user.click(
        within(sidebarNavigation()).getByRole("link", { name: "Initiatives" }),
    );
    await screen.findByRole("heading", { level: 1, name: "Initiatives" });
}

async function openInitiative(user: User, name: RegExp) {
    await openInitiativesPage(user);
    await user.click(await screen.findByRole("link", { name }));
    return screen.findByRole("textbox", { name: "Description" });
}

async function createInitiative(user: User) {
    await openInitiativesPage(user);
    await user.click(screen.getByRole("button", { name: "New initiative" }));
    return screen.findByRole("textbox", { name: "Description" });
}

/** The names of the initiatives in the list, in the order shown, read from their archive buttons. */
function listedInitiativeNames(): string[] {
    const names: string[] = [];
    screen.queryAllByRole("button", {
        name: (name) => {
            const match = /^Archive "(.*)"$/.exec(name);
            if (match) names.push(match[1]);
            return match !== null;
        },
    });
    return names;
}

function seedThreeInitiatives() {
    backend.seed({ name: "Checkout redesign" });
    const migration = backend.seed({ name: "Data migration" });
    backend.seed({ name: "Launch" });
    return { migration };
}

describe("Managing initiatives", () => {
    describe("section", () => {
        it("has an Initiatives link below Meetings that opens the Initiatives page", async () => {
            const user = renderApp();
            await screen.findByRole("heading", { level: 1, name: "Meetings" });

            const links = within(sidebarNavigation()).getAllByRole("link");
            expect(links.map((link) => link.textContent)).toEqual([
                "Meetings",
                "Initiatives",
            ]);

            await openInitiativesPage(user);
            expect(breadcrumb()).toHaveTextContent("Initiatives");
            expect(
                within(sidebarNavigation()).getByRole("link", {
                    name: "Initiatives",
                }),
            ).toHaveAttribute("aria-current", "page");
        });

        it("keeps Initiatives marked as current on an initiative editor page", async () => {
            backend.seed({ name: "Launch" });
            const user = renderApp();

            await openInitiative(user, /Launch/);

            expect(
                within(sidebarNavigation()).getByRole("link", {
                    name: "Initiatives",
                }),
            ).toHaveAttribute("aria-current", "page");
        });
    });

    describe("Initiatives page", () => {
        it("says there are no initiatives and shows a New initiative button", async () => {
            const user = renderApp();

            await openInitiativesPage(user);

            expect(
                await screen.findByText("No initiatives yet"),
            ).toBeInTheDocument();
            expect(
                screen.getByRole("button", { name: "New initiative" }),
            ).toBeInTheDocument();
        });

        it("lists initiatives newest first with their roles", async () => {
            backend.seed({ name: "Checkout redesign", raciRole: "consulted" });
            backend.seed({ name: "", raciRole: null });
            backend.seed({ name: "Launch", raciRole: "responsible" });
            backend.seed({
                name: "Old pilot",
                archivedAt: "2026-09-01T00:00:00.000Z",
            });
            const user = renderApp();

            await openInitiativesPage(user);
            await screen.findByRole("link", { name: /Launch/ });

            expect(listedInitiativeNames()).toEqual([
                "Launch",
                "Untitled initiative",
                "Checkout redesign",
            ]);
            expect(
                screen.getByRole("link", { name: /Launch/ }),
            ).toHaveTextContent("Responsible");
            expect(
                screen.getByRole("link", { name: /Checkout redesign/ }),
            ).toHaveTextContent("Consulted");
            expect(
                screen.getByRole("link", { name: /Untitled initiative/ })
                    .textContent,
            ).toBe("Untitled initiative");
            expect(screen.queryByText(/Old pilot/)).not.toBeInTheDocument();
            expect(invoke).toHaveBeenCalledWith("list_initiatives", {
                includeArchived: false,
            });
        });

        it("shows an error with a Retry button when the list cannot be loaded", async () => {
            backend.seed({ name: "Launch" });
            backend.failNextList = true;
            const user = renderApp();

            await user.click(
                within(sidebarNavigation()).getByRole("link", {
                    name: "Initiatives",
                }),
            );
            expect(
                await screen.findByText("Couldn't load initiatives"),
            ).toBeInTheDocument();
            await user.click(screen.getByRole("button", { name: "Retry" }));

            expect(
                await screen.findByRole("link", { name: /Launch/ }),
            ).toBeInTheDocument();
        });
    });

    describe("creating an initiative", () => {
        it("creates an untitled initiative and opens it with its name selected", async () => {
            const user = renderApp();

            await createInitiative(user);

            expect(invoke).toHaveBeenCalledWith("create_initiative", {});
            const name = screen.getByRole<HTMLInputElement>("textbox", {
                name: "Initiative name",
            });
            expect(name).toHaveValue("Untitled initiative");
            expect(name).toHaveFocus();
            expect(name.selectionStart).toBe(0);
            expect(name.selectionEnd).toBe("Untitled initiative".length);
            expect(roleSelect()).toHaveValue("");
            expect(breadcrumb().textContent).toMatch(
                /Initiatives.*Untitled initiative/,
            );
        });

        it("reports the problem in a failure toast when the initiative cannot be created", async () => {
            backend.failCreate = true;
            const user = renderApp();
            await openInitiativesPage(user);

            const button = screen.getByRole("button", {
                name: "New initiative",
            });
            await user.click(button);

            const message = "Couldn't create the initiative. Try again.";
            expect(
                await within(notifications()).findByText(message),
            ).toBeInTheDocument();
            expect(screen.getAllByText(message)).toHaveLength(1);
            expect(button).toBeEnabled();
            expect(
                screen.getByRole("heading", { level: 1, name: "Initiatives" }),
            ).toBeInTheDocument();
        });
    });

    describe("initiative editor page", () => {
        it("shows the role select with an empty choice and the four RACI roles", async () => {
            backend.seed({ name: "Launch", raciRole: "accountable" });
            const user = renderApp();

            await openInitiative(user, /Launch/);

            const select = roleSelect();
            expect(select).toHaveValue("accountable");
            expect(
                Array.from(select.options).map((option) => option.text),
            ).toEqual([
                "",
                "Responsible",
                "Accountable",
                "Consulted",
                "Informed",
            ]);
            expect(
                within(initiativeDetails()).getByText("Role"),
            ).toBeInTheDocument();
            expect(
                within(initiativeDetails()).getByRole("button", {
                    name: "Archive",
                }),
            ).toBeInTheDocument();
        });

        it("autosaves the name, the description as Markdown, and the role", async () => {
            const user = renderApp();
            const description = await createInitiative(user);

            const name = screen.getByRole("textbox", {
                name: "Initiative name",
            });
            await user.clear(name);
            await user.type(name, "Launch");
            await user.click(description);
            await user.click(screen.getByRole("button", { name: "Bold" }));
            await user.keyboard("Own the rollout");
            await user.selectOptions(roleSelect(), "Responsible");

            await waitFor(
                () =>
                    expect(backend.lastUpdate()).toMatchObject({
                        name: "Launch",
                        description: expect.stringContaining(
                            "**Own the rollout**",
                        ),
                        raciRole: "responsible",
                    }),
                SAVE_TIMEOUT,
            );
            expect(await screen.findByText("Saved")).toBeInTheDocument();
            expect(breadcrumb()).toHaveTextContent("Launch");

            await openInitiativesPage(user);
            expect(
                await screen.findByRole("link", { name: /Launch/ }),
            ).toHaveTextContent("Responsible");
        });

        it("clears the role when the empty choice is selected", async () => {
            backend.seed({ name: "Launch", raciRole: "informed" });
            const user = renderApp();
            await openInitiative(user, /Launch/);

            await user.selectOptions(roleSelect(), "");

            await waitFor(
                () =>
                    expect(backend.lastUpdate()).toMatchObject({
                        raciRole: null,
                    }),
                SAVE_TIMEOUT,
            );
        });

        it("shows a stored Markdown description as formatted text", async () => {
            backend.seed({
                name: "Launch",
                description: "## Goals\n\n- Ship in Q4\n",
            });
            const user = renderApp();

            const description = await openInitiative(user, /Launch/);

            expect(
                await within(description).findByRole("heading", {
                    level: 2,
                    name: "Goals",
                }),
            ).toBeInTheDocument();
            expect(description).toHaveTextContent("Ship in Q4");
            expect(description).not.toHaveTextContent("##");
        });

        it("saves a pending change immediately when the user leaves the page", async () => {
            backend.seed({ name: "Launch" });
            const user = renderApp();
            const description = await openInitiative(user, /Launch/);

            await user.type(description, "Quick thought");
            await user.click(
                within(sidebarNavigation()).getByRole("link", {
                    name: "Initiatives",
                }),
            );

            await waitFor(
                () =>
                    expect(backend.lastUpdate()?.description.trim()).toBe(
                        "Quick thought",
                    ),
                { timeout: 300 },
            );
        });

        it("returns to the Initiatives page from the breadcrumb", async () => {
            backend.seed({ name: "Launch" });
            const user = renderApp();
            await openInitiative(user, /Launch/);

            await user.click(
                within(breadcrumb()).getByRole("link", { name: "Initiatives" }),
            );

            expect(
                await screen.findByRole("heading", {
                    level: 1,
                    name: "Initiatives",
                }),
            ).toBeInTheDocument();
        });

        it("says so when the initiative cannot be loaded, and loads it again on Retry", async () => {
            backend.seed({ name: "Launch" });
            const user = renderApp();
            await openInitiativesPage(user);
            backend.failNextGet = true;

            await user.click(
                await screen.findByRole("link", { name: /Launch/ }),
            );
            expect(
                await screen.findByText("Couldn't load this initiative"),
            ).toBeInTheDocument();
            await user.click(screen.getByRole("button", { name: "Retry" }));

            expect(
                await screen.findByRole("textbox", { name: "Initiative name" }),
            ).toHaveValue("Launch");
        });
    });

    describe("archiving an initiative", () => {
        it("removes the initiative from the list and shows a toast with Undo", async () => {
            const { migration } = seedThreeInitiatives();
            const user = renderApp();
            await openInitiativesPage(user);

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Data migration"',
                }),
            );

            expect(invoke).toHaveBeenCalledWith("archive_initiative", {
                id: migration.id,
            });
            await waitFor(() =>
                expect(listedInitiativeNames()).toEqual([
                    "Launch",
                    "Checkout redesign",
                ]),
            );
            expect(
                await within(notifications()).findByText(
                    'Archived "Data migration".',
                ),
            ).toBeInTheDocument();
            await waitFor(() =>
                expect(
                    screen.getByRole("button", {
                        name: 'Archive "Checkout redesign"',
                    }),
                ).toHaveFocus(),
            );
        });

        it("moves focus to the initiative before when the last one is archived", async () => {
            seedThreeInitiatives();
            const user = renderApp();
            await openInitiativesPage(user);

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Checkout redesign"',
                }),
            );

            await waitFor(() =>
                expect(
                    screen.getByRole("button", {
                        name: 'Archive "Data migration"',
                    }),
                ).toHaveFocus(),
            );
        });

        it("moves focus to New initiative when the list becomes empty", async () => {
            backend.seed({ name: "Launch" });
            const user = renderApp();
            await openInitiativesPage(user);

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Launch"',
                }),
            );

            expect(
                await screen.findByText("No initiatives yet"),
            ).toBeInTheDocument();
            await waitFor(() =>
                expect(
                    screen.getByRole("button", { name: "New initiative" }),
                ).toHaveFocus(),
            );
        });

        it("restores the initiative with Undo and moves focus to its link", async () => {
            seedThreeInitiatives();
            const user = renderApp();
            await openInitiativesPage(user);
            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Data migration"',
                }),
            );

            await user.click(
                await within(notifications()).findByRole("button", {
                    name: "Undo",
                }),
            );

            await waitFor(() =>
                expect(listedInitiativeNames()).toEqual([
                    "Launch",
                    "Data migration",
                    "Checkout redesign",
                ]),
            );
            await waitFor(() =>
                expect(
                    screen.getByRole("link", { name: /Data migration/ }),
                ).toHaveFocus(),
            );
            expect(
                within(notifications()).queryByText(
                    'Archived "Data migration".',
                ),
            ).not.toBeInTheDocument();
        });

        it("keeps the initiative and reports the problem when archiving fails", async () => {
            seedThreeInitiatives();
            backend.failArchive = true;
            const user = renderApp();
            await openInitiativesPage(user);

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Data migration"',
                }),
            );

            const message = "Couldn't archive the initiative. Try again.";
            expect(
                await within(notifications()).findByText(message),
            ).toBeInTheDocument();
            expect(screen.getAllByText(message)).toHaveLength(1);
            expect(
                screen.getByRole("link", { name: /Data migration/ }),
            ).toBeInTheDocument();
        });

        it("says so in the toast when the initiative cannot be restored", async () => {
            backend.seed({ name: "Launch" });
            const user = renderApp();
            await openInitiativesPage(user);
            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Launch"',
                }),
            );
            backend.failUnarchive = true;

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
            expect(backend.find(1)?.archivedAt).not.toBeNull();
        });

        it("archives from the editor page, saves pending changes, and focuses New initiative", async () => {
            backend.seed({ name: "Launch" });
            const user = renderApp();
            const description = await openInitiative(user, /Launch/);

            await user.type(description, "Last words");
            await user.click(
                within(initiativeDetails()).getByRole("button", {
                    name: "Archive",
                }),
            );

            expect(
                await screen.findByRole("heading", {
                    level: 1,
                    name: "Initiatives",
                }),
            ).toBeInTheDocument();
            expect(
                await within(notifications()).findByText('Archived "Launch".'),
            ).toBeInTheDocument();
            await waitFor(() =>
                expect(
                    screen.getByRole("button", { name: "New initiative" }),
                ).toHaveFocus(),
            );
            await waitFor(() =>
                expect(backend.lastUpdate()?.description.trim()).toBe(
                    "Last words",
                ),
            );
        });

        it("shares one archive toast between meetings and initiatives", async () => {
            backend.seedMeeting("Weekly sync");
            backend.seed({ name: "Launch" });
            const user = renderApp();

            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Weekly sync"',
                }),
            );
            expect(
                await within(notifications()).findByText(
                    'Archived "Weekly sync".',
                ),
            ).toBeInTheDocument();

            await openInitiativesPage(user);
            await user.click(
                await screen.findByRole("button", {
                    name: 'Archive "Launch"',
                }),
            );

            expect(
                await within(notifications()).findByText('Archived "Launch".'),
            ).toBeInTheDocument();
            await waitFor(() =>
                expect(
                    within(notifications()).queryByText(
                        'Archived "Weekly sync".',
                    ),
                ).not.toBeInTheDocument(),
            );
        });
    });
});
