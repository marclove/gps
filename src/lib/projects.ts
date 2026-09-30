import { invoke } from "@tauri-apps/api/core";

/**
 * One project, with its name and its description. The backend type is `Project` in
 * `src-tauri/src/projects.rs`.
 */
export type Project = {
    id: number;
    /** The name, without spaces at the start or the end. It can be empty. */
    name: string;
    /** The description, as Markdown. */
    description: string;
    /** The time when the project was created, as an RFC 3339 timestamp in UTC. */
    createdAt: string;
    /** The time when the name or the description was last changed, as an RFC 3339 timestamp in UTC. */
    updatedAt: string;
    /** The time when the project was deleted, as an RFC 3339 timestamp in UTC, or `null` if it is not deleted. */
    deletedAt: string | null;
};

/** The first values of a new project, which `createProject` saves. */
export type NewProject = {
    name: string;
    description: string;
};

/** The answer of the backend to a create. */
export type CreateProjectResult =
    { status: "created"; project: Project } | { status: "nameTaken" };

/** The answer of the backend to a rename. */
export type RenameProjectResult =
    { status: "renamed"; project: Project } | { status: "nameTaken" };

/** The answer of the backend to a delete. */
export type DeleteProjectResult =
    | { status: "deleted" }
    | { status: "hasInitiatives" }
    | { status: "hasTasks" };

/** The answer of the backend to a restore of a deleted project. */
export type RestoreProjectResult =
    { status: "restored" } | { status: "nameTaken" };

/** The name that is shown for a project with an empty name. */
export const DEFAULT_PROJECT_NAME = "Untitled project";

/** Returns the name to show for a project. A project with an empty name shows the default name. */
export function projectDisplayName(name: string): string {
    return name.trim() === "" ? DEFAULT_PROJECT_NAME : name;
}

/**
 * Returns a new array with the projects sorted by the shown name, without regard to case.
 * Does not change `projects`.
 */
export function sortProjects(projects: Project[]): Project[] {
    return [...projects].sort((a, b) =>
        projectDisplayName(a.name).localeCompare(
            projectDisplayName(b.name),
            undefined,
            { sensitivity: "base" },
        ),
    );
}

/** Returns the projects. Deleted projects are included only when asked. */
export function listProjects(options: {
    includeDeleted: boolean;
}): Promise<Project[]> {
    return invoke<Project[]>("list_projects", {
        includeDeleted: options.includeDeleted,
    });
}

/**
 * Creates a project with the given values. The backend removes the spaces at the start and
 * end of the name. The result is "nameTaken" if another project that is not deleted has the
 * same name, and then nothing is saved. The backend rejects the values when the name and the
 * description are both empty.
 */
export function createProject(
    values: NewProject,
): Promise<CreateProjectResult> {
    return invoke<CreateProjectResult>("create_project", {
        name: values.name,
        description: values.description,
    });
}

/** Returns the project with the given identifier, also a deleted one, or `null` if it does not exist. */
export function getProject(id: number): Promise<Project | null> {
    return invoke<Project | null>("get_project", { id });
}

/**
 * Renames a project. The backend removes the spaces at the start and end of the name. The
 * result is "nameTaken" if another project that is not deleted has the same name.
 */
export function renameProject(
    id: number,
    name: string,
): Promise<RenameProjectResult> {
    return invoke<RenameProjectResult>("rename_project", { id, name });
}

/** Replaces the description of a project and returns the stored project. */
export function updateProject(
    id: number,
    description: string,
): Promise<Project> {
    return invoke<Project>("update_project", { id, description });
}

/**
 * Deletes a project, so it no longer appears in the list. The user can restore it. The result
 * is "hasInitiatives" if the project still has initiatives that are not deleted. Else, the
 * result is "hasTasks" if the project still has tasks that are not deleted. In both cases,
 * nothing changes.
 */
export function deleteProject(id: number): Promise<DeleteProjectResult> {
    return invoke<DeleteProjectResult>("delete_project", { id });
}

/**
 * Restores a deleted project, so it appears in the list again. The result is "nameTaken" if
 * another project that is not deleted has the same name.
 */
export function restoreProject(id: number): Promise<RestoreProjectResult> {
    return invoke<RestoreProjectResult>("restore_project", { id });
}
