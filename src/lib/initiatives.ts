import { invoke } from "@tauri-apps/api/core";

/** A role of the RACI model that the user can have in an initiative. */
export type RaciRole = "responsible" | "accountable" | "consulted" | "informed";

/**
 * One initiative, with its description and the role of the user in it. The backend type is
 * `Initiative` in `src-tauri/src/initiatives.rs`.
 */
export type Initiative = {
    id: number;
    name: string;
    /** The description, as Markdown. */
    description: string;
    /** The role of the user in the initiative, or `null` if the user did not choose a role. */
    raciRole: RaciRole | null;
    /** The time when the initiative was created, as an RFC 3339 timestamp in UTC. */
    createdAt: string;
    /** The time when the initiative was last changed, as an RFC 3339 timestamp in UTC. */
    updatedAt: string;
    /** The time when the initiative was archived, as an RFC 3339 timestamp in UTC, or `null` if it is not archived. */
    archivedAt: string | null;
};

/** The part of an initiative that a list of initiatives shows. */
export type InitiativeSummary = Pick<
    Initiative,
    "id" | "name" | "raciRole" | "updatedAt" | "archivedAt"
>;

/** The fields of an initiative that the user can change. */
export type InitiativeChanges = Pick<
    Initiative,
    "name" | "description" | "raciRole"
>;

/** The name that the backend gives a new initiative. Also shown for an initiative with an empty name. */
export const DEFAULT_INITIATIVE_NAME = "Untitled initiative";

/** The RACI roles with their labels, in the order of the RACI model. */
export const RACI_ROLES: { value: RaciRole; label: string }[] = [
    { value: "responsible", label: "Responsible" },
    { value: "accountable", label: "Accountable" },
    { value: "consulted", label: "Consulted" },
    { value: "informed", label: "Informed" },
];

/** Returns the label to show for a RACI role. */
export function raciRoleLabel(role: RaciRole): string {
    return RACI_ROLES.find((r) => r.value === role)?.label ?? role;
}

/** Returns the name to show for an initiative. An initiative with an empty name shows the default name. */
export function initiativeDisplayName(name: string): string {
    return name.trim() === "" ? DEFAULT_INITIATIVE_NAME : name;
}

/** One choice of an initiative in the select box of a meeting. */
export type InitiativeChoice = { id: number; label: string };

/**
 * Returns the choices of initiatives for the select box of a meeting, without the empty
 * choice. The initiatives that are not archived come first, in the given order. The archived
 * initiatives come last, in alphabetical order of their names without regard to case, and
 * their labels end with " (archived)".
 */
export function initiativeChoices(
    initiatives: InitiativeSummary[],
): InitiativeChoice[] {
    const active = initiatives
        .filter((initiative) => initiative.archivedAt === null)
        .map((initiative) => ({
            id: initiative.id,
            label: initiativeDisplayName(initiative.name),
        }));
    const archived = initiatives
        .filter((initiative) => initiative.archivedAt !== null)
        .map((initiative) => ({
            id: initiative.id,
            name: initiativeDisplayName(initiative.name),
        }))
        .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        )
        .map(({ id, name }) => ({ id, label: `${name} (archived)` }));
    return [...active, ...archived];
}

/** Returns summaries of initiatives, with the newest first. Archived initiatives are included only when asked. */
export function listInitiatives(options: {
    includeArchived: boolean;
}): Promise<InitiativeSummary[]> {
    return invoke<InitiativeSummary[]>("list_initiatives", {
        includeArchived: options.includeArchived,
    });
}

/** Creates an initiative with the default name, an empty description, and no role. */
export function createInitiative(): Promise<Initiative> {
    return invoke<Initiative>("create_initiative", {});
}

/** Returns the initiative with the given identifier, or `null` if it does not exist. */
export function getInitiative(id: number): Promise<Initiative | null> {
    return invoke<Initiative | null>("get_initiative", { id });
}

/** Replaces the name, description, and role of an initiative and returns the stored initiative. */
export function updateInitiative(
    id: number,
    changes: InitiativeChanges,
): Promise<Initiative> {
    return invoke<Initiative>("update_initiative", { id, ...changes });
}

/** Archives an initiative, so it no longer appears in the list of initiatives. */
export function archiveInitiative(id: number): Promise<void> {
    return invoke<void>("archive_initiative", { id });
}

/** Restores an archived initiative, so it appears in the list of initiatives again. */
export function unarchiveInitiative(id: number): Promise<void> {
    return invoke<void>("unarchive_initiative", { id });
}
