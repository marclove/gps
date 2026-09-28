import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    COLUMNS,
    compareRanks,
    createInitiative,
    deleteInitiative,
    getInitiative,
    initiativeChoices,
    initiativeDisplayName,
    listInitiatives,
    moveInitiative,
    raciRoleLabel,
    renameInitiative,
    restoreInitiative,
    setInitiativeProject,
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
            projectId: 5,
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
        await setInitiativeProject(3, 5);
        await moveInitiative(3, "done", 0);
        await deleteInitiative(3);
        await restoreInitiative(3);

        expect(invoke.mock.calls).toEqual([
            ["list_initiatives", { includeDeleted: true }],
            [
                "create_initiative",
                {
                    projectId: 5,
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
            ["set_initiative_project", { id: 3, projectId: 5 }],
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

        invoke.mockResolvedValueOnce({ status: "projectDeleted" });
        await expect(restoreInitiative(3)).resolves.toEqual({
            status: "projectDeleted",
        });

        invoke.mockResolvedValueOnce({ status: "nameTaken" });
        await expect(setInitiativeProject(3, 5)).resolves.toEqual({
            status: "nameTaken",
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
        projectId: 1,
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

describe("initiativeChoices", () => {
    it("sorts the choices alphabetically without regard to case", () => {
        const choices = initiativeChoices(
            [
                summary({ id: 1, name: "zeta" }),
                summary({ id: 2, name: "Beta", horizon: "later" }),
                summary({ id: 3, name: "alpha", horizon: "next" }),
                summary({ id: 4, name: "   " }),
            ],
            1,
            new Set(),
        );

        expect(choices).toEqual([
            { id: 3, label: "alpha", deleted: false },
            { id: 2, label: "Beta", deleted: false },
            { id: 4, label: "Untitled initiative", deleted: false },
            { id: 1, label: "zeta", deleted: false },
        ]);
    });

    it("includes a completed initiative", () => {
        expect(
            initiativeChoices(
                [summary({ id: 1, name: "Won", completedAt: COMPLETED })],
                1,
                new Set(),
            ),
        ).toEqual([{ id: 1, label: "Won", deleted: false }]);
    });

    it("includes a deleted initiative only when it is linked, with (deleted) after its name", () => {
        const all = [
            summary({ id: 1, name: "Old", deletedAt: DELETED }),
            summary({
                id: 2,
                name: "",
                completedAt: COMPLETED,
                deletedAt: DELETED,
            }),
            summary({ id: 3, name: "Gone", deletedAt: DELETED }),
        ];

        expect(initiativeChoices(all, 1, new Set([1, 2]))).toEqual([
            { id: 1, label: "Old (deleted)", deleted: true },
            { id: 2, label: "Untitled initiative (deleted)", deleted: true },
        ]);
    });

    it("leaves out the initiatives of other projects", () => {
        const all = [
            summary({ id: 1, name: "Launch" }),
            summary({ id: 2, name: "Invoices", projectId: 2 }),
            summary({
                id: 3,
                name: "Gone",
                projectId: 2,
                deletedAt: DELETED,
            }),
        ];

        expect(initiativeChoices(all, 1, new Set([3]))).toEqual([
            { id: 1, label: "Launch", deleted: false },
        ]);
    });

    it("returns no choices when there is no project", () => {
        const all = [
            summary({ id: 1, name: "Launch" }),
            summary({ id: 2, name: "Old", deletedAt: DELETED }),
        ];

        expect(initiativeChoices(all, null, new Set([2]))).toEqual([]);
    });
});
