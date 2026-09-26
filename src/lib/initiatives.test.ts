import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    RACI_ROLES,
    archiveInitiative,
    createInitiative,
    getInitiative,
    initiativeChoices,
    initiativeDisplayName,
    listInitiatives,
    raciRoleLabel,
    unarchiveInitiative,
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
        await listInitiatives({ includeArchived: true });
        await listInitiatives({ includeArchived: false });
        await createInitiative();
        await getInitiative(3);
        await updateInitiative(3, {
            name: "Launch",
            description: "## Goals",
            raciRole: "accountable",
        });
        await updateInitiative(3, {
            name: "Launch",
            description: "",
            raciRole: null,
        });
        await archiveInitiative(3);
        await unarchiveInitiative(3);

        expect(invoke.mock.calls).toEqual([
            ["list_initiatives", { includeArchived: true }],
            ["list_initiatives", { includeArchived: false }],
            ["create_initiative", {}],
            ["get_initiative", { id: 3 }],
            [
                "update_initiative",
                {
                    id: 3,
                    name: "Launch",
                    description: "## Goals",
                    raciRole: "accountable",
                },
            ],
            [
                "update_initiative",
                { id: 3, name: "Launch", description: "", raciRole: null },
            ],
            ["archive_initiative", { id: 3 }],
            ["unarchive_initiative", { id: 3 }],
        ]);
    });
});

describe("initiativeDisplayName", () => {
    it("shows the default name for an empty or blank name", () => {
        expect(initiativeDisplayName("")).toBe("Untitled initiative");
        expect(initiativeDisplayName("   ")).toBe("Untitled initiative");
        expect(initiativeDisplayName("Launch")).toBe("Launch");
    });
});

describe("RACI roles", () => {
    it("lists the roles in RACI order with their labels", () => {
        expect(RACI_ROLES.map((r) => r.label)).toEqual([
            "Responsible",
            "Accountable",
            "Consulted",
            "Informed",
        ]);
        expect(RACI_ROLES.map((r) => r.value)).toEqual([
            "responsible",
            "accountable",
            "consulted",
            "informed",
        ]);
    });

    it("gives the label of a role", () => {
        expect(raciRoleLabel("consulted")).toBe("Consulted");
    });
});

describe("initiativeChoices", () => {
    function summary(
        id: number,
        name: string,
        archived: boolean,
    ): InitiativeSummary {
        return {
            id,
            name,
            raciRole: null,
            updatedAt: "2026-09-26T10:00:00.000Z",
            archivedAt: archived ? "2026-09-26T11:00:00.000Z" : null,
        };
    }

    it("lists active initiatives in list order, then archived ones by name", () => {
        const choices = initiativeChoices([
            summary(1, "Launch", false),
            summary(2, "zeta pilot", true),
            summary(3, "", false),
            summary(4, "Alpha program", true),
            summary(5, "Beta rollout", true),
        ]);

        expect(choices).toEqual([
            { id: 1, label: "Launch" },
            { id: 3, label: "Untitled initiative" },
            { id: 4, label: "Alpha program (archived)" },
            { id: 5, label: "Beta rollout (archived)" },
            { id: 2, label: "zeta pilot (archived)" },
        ]);
    });
});
