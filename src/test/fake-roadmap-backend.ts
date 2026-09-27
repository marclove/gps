/**
 * An in-memory fake of the backend commands for meetings and initiatives, for the
 * feature specs of the roadmap. It keeps the order of the initiatives in each column
 * in the same way as the real backend: the positions of the initiatives on the board
 * in each column are 0, 1, 2, and so on.
 */

export type Horizon = "now" | "next" | "later";
export type RaciRole = "responsible" | "accountable" | "consulted" | "informed";

export type StoredInitiative = {
    id: number;
    name: string;
    description: string;
    raciRole: RaciRole | null;
    horizon: Horizon;
    position: number;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    archivedAt: string | null;
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
    archived?: boolean;
};

/** The names of the commands that the fake can be told to fail. */
export type FailingCommand =
    | "list_initiatives"
    | "create_initiative"
    | "get_initiative"
    | "update_initiative"
    | "move_initiative"
    | "archive_initiative"
    | "unarchive_initiative"
    | "set_meeting_initiative"
    | "archive_meeting";

/** Returns the initiative as `list_initiatives` returns it, without its description. */
function summary(initiative: StoredInitiative) {
    const {
        id,
        name,
        raciRole,
        horizon,
        position,
        createdAt,
        updatedAt,
        completedAt,
        archivedAt,
    } = initiative;
    return {
        id,
        name,
        raciRole,
        horizon,
        position,
        createdAt,
        updatedAt,
        completedAt,
        archivedAt,
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
                    i.archivedAt === null,
            )
            .sort((a, b) => a.position - b.position);
    }

    /** Gives the initiatives on the board in the column the positions 0, 1, 2, and so on. */
    private renumber(horizon: Horizon, order: StoredInitiative[]) {
        order.forEach((initiative, index) => {
            initiative.horizon = horizon;
            initiative.position = index;
        });
    }

    private insert(
        initiative: StoredInitiative,
        horizon: Horizon,
        index: number,
    ) {
        const column = this.onBoard(horizon).filter((i) => i !== initiative);
        column.splice(
            Math.min(Math.max(index, 0), column.length),
            0,
            initiative,
        );
        this.renumber(horizon, column);
    }

    /** Closes the gap that the initiative leaves in its column. It keeps its own position. */
    private remove(initiative: StoredInitiative) {
        this.renumber(
            initiative.horizon,
            this.onBoard(initiative.horizon).filter((i) => i !== initiative),
        );
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
            position: this.onBoard(horizon).length,
            createdAt: now,
            updatedAt: now,
            completedAt: fields.completed ? now : null,
            archivedAt: fields.archived ? now : null,
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
            .filter((i) => i.completedAt !== null && i.archivedAt === null)
            .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
            .map((i) => i.name);
    }

    find(name: string): StoredInitiative {
        const initiative = this.initiatives.find((i) => i.name === name);
        if (!initiative) throw new Error(`no initiative named ${name}`);
        return initiative;
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
            case "archive_meeting":
            case "unarchive_meeting":
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
                            args.includeArchived === true ||
                            i.archivedAt === null,
                    )
                    .map((initiative) => summary(initiative));
            case "create_initiative": {
                const now = this.now();
                const initiative: StoredInitiative = {
                    id: this.nextId++,
                    name: "",
                    description: "",
                    raciRole: null,
                    horizon: "later",
                    position: 0,
                    createdAt: now,
                    updatedAt: now,
                    completedAt: null,
                    archivedAt: null,
                };
                this.initiatives.push(initiative);
                this.insert(initiative, "later", 0);
                return { ...initiative };
            }
            case "get_initiative": {
                const initiative = this.initiatives.find(
                    (i) => i.id === args.id,
                );
                return initiative ? { ...initiative } : null;
            }
            case "update_initiative": {
                const initiative = this.initiative(args.id);
                Object.assign(initiative, {
                    name: args.name,
                    description: args.description,
                    raciRole: args.raciRole,
                    updatedAt: this.now(),
                });
                return { ...initiative };
            }
            case "move_initiative": {
                const initiative = this.initiative(args.id);
                if (initiative.archivedAt !== null) {
                    throw `initiative ${String(args.id)} is deleted`;
                }
                const destination = args.destination as Horizon | "done";
                if (destination === "done") {
                    if (initiative.completedAt === null) {
                        this.remove(initiative);
                        initiative.completedAt = this.now();
                    }
                } else {
                    if (initiative.completedAt === null)
                        this.remove(initiative);
                    initiative.completedAt = null;
                    this.insert(initiative, destination, args.index as number);
                }
                return null;
            }
            case "archive_initiative": {
                const initiative = this.initiative(args.id);
                if (initiative.archivedAt === null) {
                    if (initiative.completedAt === null)
                        this.remove(initiative);
                    initiative.archivedAt = this.now();
                }
                return null;
            }
            case "unarchive_initiative": {
                const initiative = this.initiative(args.id);
                if (initiative.archivedAt !== null) {
                    initiative.archivedAt = null;
                    if (initiative.completedAt === null) {
                        this.insert(
                            initiative,
                            initiative.horizon,
                            initiative.position,
                        );
                    }
                }
                return null;
            }
            default:
                throw `unexpected command ${command}`;
        }
    };
}
