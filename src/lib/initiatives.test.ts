import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    COLUMNS,
    compareRanks,
    createInitiative,
    deletedInitiativeChoices,
    deleteInitiative,
    getInitiative,
    initiativeChoiceGroups,
    initiativeDisplayName,
    listInitiatives,
    moveInitiative,
    raciRoleLabel,
    renameInitiative,
    restoreInitiative,
    updateInitiative,
    type InitiativeSummary,
} from "./initiatives";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
});

describe("initiative commands", () => {
    it("calls the backend commands with their arguments", async () => {
        await listInitiatives({ includeDeleted: true });
        await createInitiative({
            name: " Launch ",
            description: "- Ship it",
            raciRole: "informed",
        });
        await getInitiative(3);
        await renameInitiative(3, "Launch");
        await updateInitiative(3, {
            description: "- Ship it",
            raciRole: "accountable",
        });
        await updateInitiative(3, { description: "", raciRole: null });
        await moveInitiative(3, "done", 0);
        await deleteInitiative(3);
        await restoreInitiative(3);

        expect(invoke.mock.calls).toEqual([
            ["list_initiatives", { includeDeleted: true }],
            [
                "create_initiative",
                {
                    name: " Launch ",
                    description: "- Ship it",
                    raciRole: "informed",
                },
            ],
            ["get_initiative", { id: 3 }],
            ["rename_initiative", { id: 3, name: "Launch" }],
            [
                "update_initiative",
                { id: 3, description: "- Ship it", raciRole: "accountable" },
            ],
            ["update_initiative", { id: 3, description: "", raciRole: null }],
            ["move_initiative", { id: 3, destination: "done", index: 0 }],
            ["delete_initiative", { id: 3 }],
            ["restore_initiative", { id: 3 }],
        ]);
    });

    it("returns the answers of the backend", async () => {
        invoke.mockResolvedValueOnce({ status: "nameTaken" });
        await expect(renameInitiative(3, "Launch")).resolves.toEqual({
            status: "nameTaken",
        });

        invoke.mockResolvedValueOnce({ status: "restored" });
        await expect(restoreInitiative(3)).resolves.toEqual({
            status: "restored",
        });
    });
});

describe("COLUMNS", () => {
    it("lists the columns of the roadmap in order", () => {
        expect(COLUMNS).toEqual([
            { id: "now", title: "Now" },
            { id: "next", title: "Next" },
            { id: "later", title: "Later" },
            { id: "done", title: "Done" },
        ]);
    });
});

describe("raciRoleLabel", () => {
    it("shows the label of each role", () => {
        expect(raciRoleLabel("responsible")).toBe("Responsible");
        expect(raciRoleLabel("accountable")).toBe("Accountable");
        expect(raciRoleLabel("consulted")).toBe("Consulted");
        expect(raciRoleLabel("informed")).toBe("Informed");
    });
});

describe("initiativeDisplayName", () => {
    it("shows the default name for an empty or blank name", () => {
        expect(initiativeDisplayName("")).toBe("Untitled initiative");
        expect(initiativeDisplayName("  ")).toBe("Untitled initiative");
        expect(initiativeDisplayName("Launch")).toBe("Launch");
    });
});

function summary(
    fields: Partial<InitiativeSummary> & { id: number },
): InitiativeSummary {
    return {
        name: `Initiative ${fields.id}`,
        raciRole: null,
        horizon: "now",
        rank: "8",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
        completedAt: null,
        deletedAt: null,
        ...fields,
    };
}

const COMPLETED = "2026-09-20T00:00:00Z";
const DELETED = "2026-09-21T00:00:00Z";

describe("compareRanks", () => {
    it("compareRanks sorts by character codes, not by language rules", () => {
        expect(compareRanks("81f", "c")).toBeLessThan(0);
        expect(compareRanks("c", "81f")).toBeGreaterThan(0);
        // localeCompare puts "a" before "B", but the character code of "B" is smaller.
        expect(compareRanks("B", "a")).toBeLessThan(0);
        expect(compareRanks("8", "8")).toBe(0);
    });
});

describe("initiativeChoiceGroups", () => {
    it("sorts by rank when the order of the ranks differs from the order of the ids", () => {
        const groups = initiativeChoiceGroups([
            summary({ id: 1, name: "Third", rank: "c" }),
            summary({ id: 2, name: "First", rank: "4" }),
            summary({ id: 3, name: "Second", rank: "81f" }),
        ]);

        expect(groups).toEqual([
            {
                label: "Now",
                choices: [
                    { id: 2, label: "First" },
                    { id: 3, label: "Second" },
                    { id: 1, label: "Third" },
                ],
            },
        ]);
    });

    it("groups the open initiatives by horizon, sorted by rank and then by id", () => {
        const groups = initiativeChoiceGroups([
            summary({ id: 5, name: "Later one", horizon: "later" }),
            summary({ id: 4, name: "Now second", rank: "c" }),
            summary({ id: 3, name: "Next one", horizon: "next" }),
            summary({ id: 2, name: "Now tie", rank: "8" }),
            summary({ id: 1, name: "Now first", rank: "8" }),
        ]);

        expect(groups).toEqual([
            {
                label: "Now",
                choices: [
                    { id: 1, label: "Now first" },
                    { id: 2, label: "Now tie" },
                    { id: 4, label: "Now second" },
                ],
            },
            { label: "Next", choices: [{ id: 3, label: "Next one" }] },
            { label: "Later", choices: [{ id: 5, label: "Later one" }] },
        ]);
    });

    it("puts completed initiatives in their own group, sorted by name, and leaves out deleted ones", () => {
        const groups = initiativeChoiceGroups([
            summary({ id: 1, name: "zeta", completedAt: COMPLETED }),
            summary({ id: 2, name: "Alpha", completedAt: COMPLETED }),
            summary({
                id: 3,
                name: "beta",
                completedAt: COMPLETED,
                deletedAt: DELETED,
            }),
            summary({ id: 4, name: "Gamma", deletedAt: DELETED }),
            summary({ id: 5, name: "", deletedAt: DELETED }),
        ]);

        expect(groups).toEqual([
            {
                label: "Completed",
                choices: [
                    { id: 2, label: "Alpha" },
                    { id: 1, label: "zeta" },
                ],
            },
        ]);
    });

    it("lists the deleted initiatives, completed or not, with their shown names", () => {
        const choices = deletedInitiativeChoices([
            summary({ id: 1, name: "Open" }),
            summary({ id: 2, name: "Won", completedAt: COMPLETED }),
            summary({
                id: 3,
                name: "beta",
                completedAt: COMPLETED,
                deletedAt: DELETED,
            }),
            summary({ id: 5, name: "", deletedAt: DELETED }),
        ]);

        expect(choices).toEqual([
            { id: 3, label: "beta" },
            { id: 5, label: "Untitled initiative" },
        ]);
    });

    it("shows the default name for an initiative with an empty name", () => {
        expect(
            initiativeChoiceGroups([summary({ id: 1, name: "   " })]),
        ).toEqual([
            {
                label: "Now",
                choices: [{ id: 1, label: "Untitled initiative" }],
            },
        ]);
    });

    it("returns no groups when there are no initiatives", () => {
        expect(initiativeChoiceGroups([])).toEqual([]);
    });
});
