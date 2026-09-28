import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createProject,
    deleteProject,
    getProject,
    listProjects,
    projectDisplayName,
    renameProject,
    restoreProject,
    sortProjects,
    updateProject,
    type Project,
} from "./projects";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
});

describe("project commands", () => {
    it("calls the backend commands with their arguments", async () => {
        await listProjects({ includeDeleted: false });
        await createProject({ name: " Checkout ", description: "- Pay" });
        await getProject(3);
        await renameProject(3, "Checkout");
        await updateProject(3, "- Pay");
        await deleteProject(3);
        await restoreProject(3);

        expect(invoke.mock.calls).toEqual([
            ["list_projects", { includeDeleted: false }],
            ["create_project", { name: " Checkout ", description: "- Pay" }],
            ["get_project", { id: 3 }],
            ["rename_project", { id: 3, name: "Checkout" }],
            ["update_project", { id: 3, description: "- Pay" }],
            ["delete_project", { id: 3 }],
            ["restore_project", { id: 3 }],
        ]);
    });

    it("returns the answers of the backend", async () => {
        invoke.mockResolvedValueOnce({ status: "hasInitiatives" });
        await expect(deleteProject(3)).resolves.toEqual({
            status: "hasInitiatives",
        });

        invoke.mockResolvedValueOnce({ status: "nameTaken" });
        await expect(restoreProject(3)).resolves.toEqual({
            status: "nameTaken",
        });
    });
});

describe("projectDisplayName", () => {
    it("shows the default name for an empty or blank name", () => {
        expect(projectDisplayName("")).toBe("Untitled project");
        expect(projectDisplayName("  ")).toBe("Untitled project");
        expect(projectDisplayName("Checkout")).toBe("Checkout");
    });
});

function project(id: number, name: string): Project {
    return {
        id,
        name,
        description: "",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
        deletedAt: null,
    };
}

describe("sortProjects", () => {
    it("sorts by the shown name without regard to case", () => {
        const input = [
            project(1, "checkout"),
            project(2, "Billing"),
            project(3, ""),
            project(4, "Admin"),
        ];

        expect(sortProjects(input).map((p) => p.id)).toEqual([4, 2, 1, 3]);
        expect(input.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    });
});
