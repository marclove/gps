import { invoke } from "@tauri-apps/api/core";

/** A role of the RACI model that the user can have in an initiative. */
export type RaciRole = "responsible" | "accountable" | "consulted" | "informed";

/** A column of the roadmap that holds initiatives that are not completed. */
export type Horizon = "now" | "next" | "later";

/** A column of the roadmap. The "done" column holds the completed initiatives. */
export type Column = Horizon | "done";

/** The columns of the roadmap with their titles, in the order that the roadmap shows them. */
export const COLUMNS: { id: Column; title: string }[] = [
    { id: "now", title: "Now" },
    { id: "next", title: "Next" },
    { id: "later", title: "Later" },
    { id: "done", title: "Done" },
];

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
    /** The column of the initiative when it is not completed. */
    horizon: Horizon;
    /**
     * The key that gives the place of the initiative in its column. Initiatives sort from the
     * top in the order of their ranks. Compare ranks only with `compareRanks`. A completed or
     * deleted initiative keeps the rank that it had last.
     */
    rank: string;
    /** The time when the initiative was created, as an RFC 3339 timestamp in UTC. */
    createdAt: string;
    /** The time when the initiative was last changed, as an RFC 3339 timestamp in UTC. */
    updatedAt: string;
    /** The time when the initiative was completed, as an RFC 3339 timestamp in UTC, or `null` if it is not completed. */
    completedAt: string | null;
    /** The time when the initiative was deleted, as an RFC 3339 timestamp in UTC, or `null` if it is not deleted. */
    deletedAt: string | null;
};

/**
 * Compares two ranks by the codes of their characters, and not by the rules of a language.
 * Returns -1 if `a` sorts first, 1 if `b` sorts first, and 0 if they are equal.
 */
export function compareRanks(a: string, b: string): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

/** The part of an initiative that the roadmap shows. */
export type InitiativeSummary = Omit<Initiative, "description">;

/** The fields of an initiative that `updateInitiative` replaces. */
export type InitiativeChanges = {
    description: string;
    raciRole: RaciRole | null;
};

/** The first values of a new initiative, which `createInitiative` saves. */
export type NewInitiative = {
    name: string;
    description: string;
    raciRole: RaciRole | null;
};

/** The answer of the backend to a create. */
export type CreateResult =
    { status: "created"; initiative: Initiative } | { status: "nameTaken" };

/** The answer of the backend to a rename. */
export type RenameResult =
    { status: "renamed"; initiative: Initiative } | { status: "nameTaken" };

/** The answer of the backend to a restore of a deleted initiative. */
export type RestoreResult = { status: "restored" } | { status: "nameTaken" };

/** The name that is shown for an initiative with an empty name. */
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

/** An initiative choice in the select box of a meeting: its identifier and its shown name. */
export type InitiativeChoice = { id: number; label: string };

/** A group of initiative choices in the select box of a meeting. */
export type ChoiceGroup = {
    label: string;
    choices: InitiativeChoice[];
};

function choice(initiative: InitiativeSummary): InitiativeChoice {
    return {
        id: initiative.id,
        label: initiativeDisplayName(initiative.name),
    };
}

function byLabel(a: { label: string }, b: { label: string }): number {
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
}

/**
 * Returns the groups of initiative choices for the select box of a meeting, without the empty
 * choice. The groups are "Now", "Next", and "Later", sorted by rank and then by
 * identifier, then "Completed", sorted by the shown name without regard to case. Deleted
 * initiatives are not included. Empty groups are not included.
 */
export function initiativeChoiceGroups(
    all: InitiativeSummary[],
): ChoiceGroup[] {
    const open = all
        .filter((i) => i.deletedAt === null && i.completedAt === null)
        .sort((a, b) => compareRanks(a.rank, b.rank) || a.id - b.id);
    const groups: ChoiceGroup[] = COLUMNS.filter(
        (column) => column.id !== "done",
    ).map((column) => ({
        label: column.title,
        choices: open.filter((i) => i.horizon === column.id).map(choice),
    }));
    groups.push({
        label: "Completed",
        choices: all
            .filter((i) => i.deletedAt === null && i.completedAt !== null)
            .map(choice)
            .sort(byLabel),
    });
    return groups.filter((group) => group.choices.length > 0);
}

/**
 * Returns the choices for the deleted initiatives, also the completed ones. The select box of
 * a meeting shows one of them only while it is the initiative that the meeting is assigned to.
 */
export function deletedInitiativeChoices(
    all: InitiativeSummary[],
): InitiativeChoice[] {
    return all.filter((i) => i.deletedAt !== null).map(choice);
}

/** Returns summaries of initiatives. Deleted initiatives are included only when asked. */
export function listInitiatives(options: {
    includeDeleted: boolean;
}): Promise<InitiativeSummary[]> {
    return invoke<InitiativeSummary[]>("list_initiatives", {
        includeDeleted: options.includeDeleted,
    });
}

/**
 * Creates an initiative with the given values at the top of Later. The backend removes the
 * spaces at the start and end of the name. The result is "nameTaken" if another initiative
 * that is not deleted has the same name, and then nothing is saved. The backend rejects the
 * values when the name is empty, the description is empty, and the role is `null`.
 */
export function createInitiative(values: NewInitiative): Promise<CreateResult> {
    return invoke<CreateResult>("create_initiative", {
        name: values.name,
        description: values.description,
        raciRole: values.raciRole,
    });
}

/** Returns the initiative with the given identifier, or `null` if it does not exist. */
export function getInitiative(id: number): Promise<Initiative | null> {
    return invoke<Initiative | null>("get_initiative", { id });
}

/**
 * Renames an initiative. The backend removes the spaces at the start and end of the name. The
 * result is "nameTaken" if another initiative that is not deleted has the same name.
 */
export function renameInitiative(
    id: number,
    name: string,
): Promise<RenameResult> {
    return invoke<RenameResult>("rename_initiative", { id, name });
}

/** Replaces the description and role of an initiative and returns the stored initiative. */
export function updateInitiative(
    id: number,
    changes: InitiativeChanges,
): Promise<Initiative> {
    return invoke<Initiative>("update_initiative", { id, ...changes });
}

/**
 * Moves an initiative to a column. The index is the place that the initiative gets in that
 * column, counted without the initiative. Moving to "done" completes the initiative, and
 * moving out of "done" reopens it.
 */
export function moveInitiative(
    id: number,
    destination: Column,
    index: number,
): Promise<void> {
    return invoke<void>("move_initiative", { id, destination, index });
}

/** Deletes an initiative, so it no longer appears on the roadmap. The user can restore it. */
export function deleteInitiative(id: number): Promise<void> {
    return invoke<void>("delete_initiative", { id });
}

/**
 * Restores a deleted initiative, so it appears on the roadmap again. The result is
 * "nameTaken" if another initiative that is not deleted has the same name.
 */
export function restoreInitiative(id: number): Promise<RestoreResult> {
    return invoke<RestoreResult>("restore_initiative", { id });
}
