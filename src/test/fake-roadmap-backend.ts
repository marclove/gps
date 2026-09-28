/**
 * An in-memory fake of the backend commands for meetings and initiatives, for the
 * feature specs of the roadmap. It keeps the order of the initiatives in each column
 * in the same way as the real backend: each initiative has a rank, a text key, and a
 * change gives only the changed initiative a new rank, between the ranks of its new
 * neighbors. The keys are not the keys that the real backend makes.
 */

const DIGITS = "0123456789abcdef";

/**
 * Returns a key that sorts after `a` and before `b`. `a` is empty for the start, and `b`
 * is `null` for the end. No key ends with "0", so there is always room before a key.
 */
function midpoint(a: string, b: string | null): string {
    if (b !== null) {
        let shared = 0;
        while ((a[shared] ?? "0") === b[shared]) shared++;
        if (shared > 0) {
            return (
                b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared))
            );
        }
    }
    const low = a === "" ? 0 : DIGITS.indexOf(a[0]);
    const high = b === null ? DIGITS.length : DIGITS.indexOf(b[0]);
    if (high - low > 1) return DIGITS[Math.round((low + high) / 2)];
    if (b !== null && b.length > 1) return b.slice(0, 1);
    return DIGITS[low] + midpoint(a.slice(1), null);
}

/** Returns a key between `before` and `after`. Either can be `null`. */
function keyBetween(before: string | null, after: string | null): string {
    return midpoint(before ?? "", after);
}

/** Compares ranks as text, by the codes of the characters, as the frontend must. */
function byRank(a: { rank: string }, b: { rank: string }): number {
    return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;
}

export type Horizon = "now" | "next" | "later";
export type RaciRole = "responsible" | "accountable" | "consulted" | "informed";

export type StoredInitiative = {
    id: number;
    name: string;
    description: string;
    raciRole: RaciRole | null;
    horizon: Horizon;
    rank: string;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    deletedAt: string | null;
};

export type StoredMeeting = {
    id: number;
    name: string;
    date: string;
    notes: string;
    initiativeId: number | null;
    createdAt: string;
    updatedAt: string;
};

export type SeedInitiative = {
    name: string;
    horizon?: Horizon;
    raciRole?: RaciRole | null;
    description?: string;
    completed?: boolean;
    deleted?: boolean;
    /** The rank. By default, a rank after every initiative in the column. */
    rank?: string;
};

/** The names of the commands that the fake can be told to fail. */
export type FailingCommand =
    | "list_initiatives"
    | "create_initiative"
    | "get_initiative"
    | "rename_initiative"
    | "update_initiative"
    | "move_initiative"
    | "delete_initiative"
    | "restore_initiative"
    | "set_meeting_initiative"
    | "delete_meeting";

/** Returns the initiative as `list_initiatives` returns it, without its description. */
function summary(initiative: StoredInitiative) {
    const {
        id,
        name,
        raciRole,
        horizon,
        rank,
        createdAt,
        updatedAt,
        completedAt,
        deletedAt,
    } = initiative;
    return {
        id,
        name,
        raciRole,
        horizon,
        rank,
        createdAt,
        updatedAt,
        completedAt,
        deletedAt,
    };
}

export class FakeRoadmapBackend {
    initiatives: StoredInitiative[] = [];
    meetings: StoredMeeting[] = [];
    /** The commands that reject with "database is locked" until removed from this set. */
    failing = new Set<FailingCommand>();
    /** The commands that reject once, and then work again. */
    failingOnce = new Set<FailingCommand>();
    private nextId = 1;
    private clock = 0;

    private now(): string {
        this.clock += 1;
        return new Date(Date.UTC(2026, 8, 24, 10, 0, this.clock)).toISOString();
    }

    private onBoard(horizon: Horizon): StoredInitiative[] {
        return this.initiatives
            .filter(
                (i) =>
                    i.horizon === horizon &&
                    i.completedAt === null &&
                    i.deletedAt === null,
            )
            .sort(byRank);
    }

    /**
     * Puts the initiative in the column at the index, counted without the initiative, by
     * giving it a rank between the ranks of its new neighbors.
     */
    private insert(
        initiative: StoredInitiative,
        horizon: Horizon,
        index: number,
    ) {
        const column = this.onBoard(horizon).filter((i) => i !== initiative);
        const at = Math.min(Math.max(index, 0), column.length);
        initiative.horizon = horizon;
        initiative.rank = keyBetween(
            column[at - 1]?.rank ?? null,
            column[at]?.rank ?? null,
        );
    }

    /**
     * Gives a restored initiative that is not completed a new rank if an initiative on the
     * board in its column has its rank: the new rank is directly after that initiative.
     */
    private keepPlace(initiative: StoredInitiative) {
        const column = this.onBoard(initiative.horizon).filter(
            (i) => i !== initiative,
        );
        const holder = column.findIndex((i) => i.rank === initiative.rank);
        if (holder === -1) return;
        initiative.rank = keyBetween(
            column[holder].rank,
            column[holder + 1]?.rank ?? null,
        );
    }

    /** The largest rank of all initiatives in the column, also completed and deleted ones. */
    private lastRank(horizon: Horizon): string | null {
        const ranks = this.initiatives
            .filter((i) => i.horizon === horizon)
            .sort(byRank);
        return ranks[ranks.length - 1]?.rank ?? null;
    }

    seedInitiative(fields: SeedInitiative): StoredInitiative {
        const horizon = fields.horizon ?? "later";
        const now = this.now();
        const initiative: StoredInitiative = {
            id: this.nextId++,
            name: fields.name,
            description: fields.description ?? "",
            raciRole: fields.raciRole ?? null,
            horizon,
            rank: fields.rank ?? keyBetween(this.lastRank(horizon), null),
            createdAt: now,
            updatedAt: now,
            completedAt: fields.completed ? now : null,
            deletedAt: fields.deleted ? now : null,
        };
        this.initiatives.push(initiative);
        return initiative;
    }

    seedMeeting(
        name: string,
        initiativeId: number | null = null,
    ): StoredMeeting {
        const now = this.now();
        const meeting: StoredMeeting = {
            id: this.nextId++,
            name,
            date: "2026-09-24",
            notes: "",
            initiativeId,
            createdAt: now,
            updatedAt: now,
        };
        this.meetings.push(meeting);
        return meeting;
    }

    /** The names of the initiatives on the board in the column, from the top. */
    column(horizon: Horizon): string[] {
        return this.onBoard(horizon).map((i) => i.name);
    }

    /** The names of the completed initiatives that are not deleted, completed last first. */
    done(): string[] {
        return this.initiatives
            .filter((i) => i.completedAt !== null && i.deletedAt === null)
            .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
            .map((i) => i.name);
    }

    find(name: string): StoredInitiative {
        const initiative = this.initiatives.find((i) => i.name === name);
        if (!initiative) throw new Error(`no initiative named ${name}`);
        return initiative;
    }

    /**
     * Tells if an initiative that is not deleted, other than `except`, has the same
     * name, without regard to case and to spaces at the start and end.
     */
    private nameTaken(name: string, except: StoredInitiative | null): boolean {
        const key = name.trim().toLowerCase();
        return (
            key !== "" &&
            this.initiatives.some(
                (i) =>
                    i !== except &&
                    i.deletedAt === null &&
                    i.name.trim().toLowerCase() === key,
            )
        );
    }

    private initiative(id: unknown): StoredInitiative {
        const initiative = this.initiatives.find((i) => i.id === id);
        if (!initiative) throw `initiative ${String(id)} not found`;
        return initiative;
    }

    private meeting(id: unknown): StoredMeeting {
        const meeting = this.meetings.find((m) => m.id === id);
        if (!meeting) throw `meeting ${String(id)} not found`;
        return meeting;
    }

    private checkFailure(command: string) {
        const name = command as FailingCommand;
        if (this.failingOnce.delete(name) || this.failing.has(name)) {
            throw "database is locked";
        }
    }

    handle = async (
        command: string,
        args: Record<string, unknown> = {},
    ): Promise<unknown> => {
        this.checkFailure(command);
        switch (command) {
            case "list_meetings":
                return this.meetings.map(({ id, name, date, updatedAt }) => ({
                    id,
                    name,
                    date,
                    updatedAt,
                }));
            case "get_meeting":
                return this.meetings.find((m) => m.id === args.id) ?? null;
            case "list_meeting_tasks":
                return [];
            case "update_meeting": {
                const meeting = this.meeting(args.id);
                Object.assign(meeting, {
                    name: args.name,
                    date: args.date,
                    notes: args.notes,
                    updatedAt: this.now(),
                });
                return meeting;
            }
            case "delete_meeting":
            case "restore_meeting":
                this.meeting(args.id);
                return null;
            case "set_meeting_initiative": {
                const meeting = this.meeting(args.id);
                const initiativeId = args.initiativeId as number | null;
                if (initiativeId !== null) this.initiative(initiativeId);
                meeting.initiativeId = initiativeId;
                meeting.updatedAt = this.now();
                return meeting;
            }
            case "list_initiatives":
                // The order is on purpose not the order of the board, because the
                // frontend sorts the initiatives.
                return [...this.initiatives]
                    .reverse()
                    .filter(
                        (i) =>
                            args.includeDeleted === true ||
                            i.deletedAt === null,
                    )
                    .map((initiative) => summary(initiative));
            case "create_initiative": {
                const name = (args.name as string).trim();
                const description = args.description as string;
                const raciRole = args.raciRole as RaciRole | null;
                if (name === "" && description === "" && raciRole === null) {
                    throw "an initiative needs a name, a description, or a role";
                }
                if (this.nameTaken(name, null)) return { status: "nameTaken" };
                const now = this.now();
                const initiative: StoredInitiative = {
                    id: this.nextId++,
                    name,
                    description,
                    raciRole,
                    horizon: "later",
                    rank: keyBetween(
                        null,
                        this.onBoard("later")[0]?.rank ?? null,
                    ),
                    createdAt: now,
                    updatedAt: now,
                    completedAt: null,
                    deletedAt: null,
                };
                this.initiatives.push(initiative);
                return { status: "created", initiative: { ...initiative } };
            }
            case "get_initiative": {
                const initiative = this.initiatives.find(
                    (i) => i.id === args.id,
                );
                return initiative ? { ...initiative } : null;
            }
            case "rename_initiative": {
                const initiative = this.initiative(args.id);
                const name = (args.name as string).trim();
                if (this.nameTaken(name, initiative)) {
                    return { status: "nameTaken" };
                }
                initiative.name = name;
                initiative.updatedAt = this.now();
                return { status: "renamed", initiative: { ...initiative } };
            }
            case "update_initiative": {
                const initiative = this.initiative(args.id);
                Object.assign(initiative, {
                    description: args.description,
                    raciRole: args.raciRole,
                    updatedAt: this.now(),
                });
                return { ...initiative };
            }
            case "move_initiative": {
                const initiative = this.initiative(args.id);
                if (initiative.deletedAt !== null) {
                    throw `initiative ${String(args.id)} is deleted`;
                }
                const destination = args.destination as Horizon | "done";
                if (destination === "done") {
                    initiative.completedAt ??= this.now();
                } else {
                    initiative.completedAt = null;
                    this.insert(initiative, destination, args.index as number);
                }
                return null;
            }
            case "delete_initiative": {
                const initiative = this.initiative(args.id);
                initiative.deletedAt ??= this.now();
                return null;
            }
            case "restore_initiative": {
                const initiative = this.initiative(args.id);
                if (initiative.deletedAt !== null) {
                    if (this.nameTaken(initiative.name, initiative)) {
                        return { status: "nameTaken" };
                    }
                    initiative.deletedAt = null;
                    if (initiative.completedAt === null) {
                        this.keepPlace(initiative);
                    }
                }
                return { status: "restored" };
            }
            default:
                throw `unexpected command ${command}`;
        }
    };
}
