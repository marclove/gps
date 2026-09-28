/**
 * An in-memory fake of the backend commands for projects, meetings, and initiatives, for
 * the feature specs of the roadmap and of projects. It keeps the order of the initiatives in each column
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

export type StoredProject = {
    id: number;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

export type StoredInitiative = {
    id: number;
    projectId: number;
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
    projectId: number | null;
    /** The initiatives that the meeting covers, also deleted ones, in ascending order. */
    initiativeIds: number[];
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

export type SeedInitiative = {
    name: string;
    /**
     * The project. By default, the first project that was seeded. If no project exists, the
     * fake seeds a project named "Unsorted" first.
     */
    project?: StoredProject;
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
    | "list_projects"
    | "create_project"
    | "get_project"
    | "rename_project"
    | "update_project"
    | "delete_project"
    | "restore_project"
    | "set_initiative_project"
    | "set_meeting_project"
    | "list_initiatives"
    | "create_initiative"
    | "get_initiative"
    | "rename_initiative"
    | "update_initiative"
    | "move_initiative"
    | "delete_initiative"
    | "restore_initiative"
    | "add_meeting_initiative"
    | "remove_meeting_initiative"
    | "delete_meeting";

/** Returns the initiative as `list_initiatives` returns it, without its description. */
function summary(initiative: StoredInitiative) {
    const {
        id,
        projectId,
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
        projectId,
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

/** Returns the name of a project or an initiative in the form that decides if two names are the same. */
function nameKey(name: string): string {
    return name.trim().toLowerCase();
}

export class FakeRoadmapBackend {
    projects: StoredProject[] = [];
    initiatives: StoredInitiative[] = [];
    meetings: StoredMeeting[] = [];
    /** The commands that reject with "database is locked" until removed from this set. */
    failing = new Set<FailingCommand>();
    /** The commands that reject once, and then work again. */
    failingOnce = new Set<FailingCommand>();
    private nextId = 1;
    // Projects count their own identifiers, as a table of the real database does, so that
    // seeding a project does not change the identifiers of initiatives and meetings.
    private nextProjectId = 1;
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

    seedProject(
        name: string,
        fields: { description?: string; deleted?: boolean } = {},
    ): StoredProject {
        const now = this.now();
        const project: StoredProject = {
            id: this.nextProjectId++,
            name,
            description: fields.description ?? "",
            createdAt: now,
            updatedAt: now,
            deletedAt: fields.deleted ? now : null,
        };
        this.projects.push(project);
        return project;
    }

    seedInitiative(fields: SeedInitiative): StoredInitiative {
        const horizon = fields.horizon ?? "later";
        const project =
            fields.project ?? this.projects[0] ?? this.seedProject("Unsorted");
        const now = this.now();
        const initiative: StoredInitiative = {
            id: this.nextId++,
            projectId: project.id,
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

    /**
     * Seeds a meeting that covers the initiatives `initiativeIds`. A meeting with initiatives
     * is about the project of the first one. Otherwise it is about `fields.project`, or about
     * no project.
     */
    seedMeeting(
        name: string,
        initiativeIds: number[] = [],
        fields: {
            project?: StoredProject;
            date?: string;
            deleted?: boolean;
        } = {},
    ): StoredMeeting {
        const now = this.now();
        const projectId =
            initiativeIds.length > 0
                ? this.initiative(initiativeIds[0]).projectId
                : (fields.project?.id ?? null);
        const meeting: StoredMeeting = {
            id: this.nextId++,
            name,
            date: fields.date ?? "2026-09-24",
            notes: "",
            projectId,
            initiativeIds: [...initiativeIds].sort((a, b) => a - b),
            createdAt: now,
            updatedAt: now,
            deletedAt: fields.deleted ? now : null,
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

    findProject(name: string): StoredProject {
        const project = this.projects.find((p) => p.name === name);
        if (!project) throw new Error(`no project named ${name}`);
        return project;
    }

    findMeeting(name: string): StoredMeeting {
        const meeting = this.meetings.find((m) => m.name === name);
        if (!meeting) throw new Error(`no meeting named ${name}`);
        return meeting;
    }

    /**
     * Returns the text of a card on the roadmap without the line that shows the name of its
     * project, so that specs about the other parts of a card do not repeat the project. Do
     * not give an initiative the name of a project in such specs.
     */
    cardText(card: HTMLElement): string {
        const names = new Set(
            this.projects.map((p) =>
                p.name.trim() === "" ? "Untitled project" : p.name,
            ),
        );
        const copy = card.cloneNode(true) as HTMLElement;
        for (const element of Array.from(copy.querySelectorAll("*"))) {
            if (
                element.children.length === 0 &&
                names.has(element.textContent ?? "")
            ) {
                element.remove();
            }
        }
        return copy.textContent ?? "";
    }

    find(name: string): StoredInitiative {
        const initiative = this.initiatives.find((i) => i.name === name);
        if (!initiative) throw new Error(`no initiative named ${name}`);
        return initiative;
    }

    /**
     * Tells if an initiative of the project that is not deleted, other than `except`, has
     * the same name, without regard to case and to spaces at the start and end.
     */
    private nameTaken(
        name: string,
        projectId: number,
        except: StoredInitiative | null,
    ): boolean {
        const key = nameKey(name);
        return (
            key !== "" &&
            this.initiatives.some(
                (i) =>
                    i !== except &&
                    i.projectId === projectId &&
                    i.deletedAt === null &&
                    nameKey(i.name) === key,
            )
        );
    }

    /**
     * Tells if a project that is not deleted, other than `except`, has the same name,
     * without regard to case and to spaces at the start and end.
     */
    private projectNameTaken(
        name: string,
        except: StoredProject | null,
    ): boolean {
        const key = nameKey(name);
        return (
            key !== "" &&
            this.projects.some(
                (p) =>
                    p !== except &&
                    p.deletedAt === null &&
                    nameKey(p.name) === key,
            )
        );
    }

    private project(id: unknown): StoredProject {
        const project = this.projects.find((p) => p.id === id);
        if (!project) throw `project ${String(id)} not found`;
        return project;
    }

    /** Returns the project, and throws if it does not exist or is deleted. */
    private activeProject(id: unknown): StoredProject {
        const project = this.project(id);
        if (project.deletedAt !== null)
            throw `project ${String(id)} is deleted`;
        return project;
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

    /** Returns the meeting as `get_meeting` returns it, without `deletedAt`. */
    private meetingResult(meeting: StoredMeeting) {
        const result: Partial<StoredMeeting> = {
            ...meeting,
            initiativeIds: [...meeting.initiativeIds],
        };
        delete result.deletedAt;
        return result;
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
                return this.meetings
                    .filter((m) => m.deletedAt === null)
                    .map(({ id, name, date, updatedAt, projectId }) => ({
                        id,
                        name,
                        date,
                        updatedAt,
                        projectId,
                    }));
            case "get_meeting": {
                const meeting = this.meetings.find((m) => m.id === args.id);
                return meeting ? this.meetingResult(meeting) : null;
            }
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
                return this.meetingResult(meeting);
            }
            case "delete_meeting": {
                const meeting = this.meeting(args.id);
                meeting.deletedAt ??= this.now();
                return null;
            }
            case "restore_meeting":
                this.meeting(args.id).deletedAt = null;
                return null;
            case "add_meeting_initiative": {
                const meeting = this.meeting(args.id);
                const initiative = this.initiative(args.initiativeId);
                if (initiative.deletedAt !== null) {
                    throw `initiative ${String(initiative.id)} is deleted`;
                }
                if (!meeting.initiativeIds.includes(initiative.id)) {
                    // A meeting follows an initiative to its project only when it covers
                    // no other initiative.
                    if (meeting.projectId !== initiative.projectId) {
                        if (meeting.initiativeIds.length > 0) {
                            throw `meeting ${String(meeting.id)} covers initiatives of another project`;
                        }
                        meeting.projectId = initiative.projectId;
                    }
                    meeting.initiativeIds = [
                        ...meeting.initiativeIds,
                        initiative.id,
                    ].sort((a, b) => a - b);
                    meeting.updatedAt = this.now();
                }
                return this.meetingResult(meeting);
            }
            case "remove_meeting_initiative": {
                const meeting = this.meeting(args.id);
                if (
                    meeting.initiativeIds.includes(args.initiativeId as number)
                ) {
                    meeting.initiativeIds = meeting.initiativeIds.filter(
                        (id) => id !== args.initiativeId,
                    );
                    meeting.updatedAt = this.now();
                }
                return this.meetingResult(meeting);
            }
            case "set_meeting_project": {
                const meeting = this.meeting(args.id);
                const projectId = args.projectId as number | null;
                if (projectId !== meeting.projectId) {
                    if (projectId !== null) this.activeProject(projectId);
                    meeting.projectId = projectId;
                    meeting.initiativeIds = [];
                    meeting.updatedAt = this.now();
                }
                return this.meetingResult(meeting);
            }
            case "list_projects":
                // The order is on purpose not the order of the names, because the
                // frontend sorts the projects.
                return [...this.projects]
                    .reverse()
                    .filter(
                        (p) =>
                            args.includeDeleted === true ||
                            p.deletedAt === null,
                    )
                    .map((project) => ({ ...project }));
            case "create_project": {
                const name = (args.name as string).trim();
                const description = args.description as string;
                if (name === "" && description === "") {
                    throw "a project needs a name or a description";
                }
                if (this.projectNameTaken(name, null)) {
                    return { status: "nameTaken" };
                }
                const project = this.seedProject(name, { description });
                return { status: "created", project: { ...project } };
            }
            case "get_project": {
                const project = this.projects.find((p) => p.id === args.id);
                return project ? { ...project } : null;
            }
            case "rename_project": {
                const project = this.project(args.id);
                const name = (args.name as string).trim();
                if (this.projectNameTaken(name, project)) {
                    return { status: "nameTaken" };
                }
                project.name = name;
                project.updatedAt = this.now();
                return { status: "renamed", project: { ...project } };
            }
            case "update_project": {
                const project = this.project(args.id);
                project.description = args.description as string;
                project.updatedAt = this.now();
                return { ...project };
            }
            case "delete_project": {
                const project = this.project(args.id);
                if (
                    this.initiatives.some(
                        (i) =>
                            i.projectId === project.id && i.deletedAt === null,
                    )
                ) {
                    return { status: "hasInitiatives" };
                }
                project.deletedAt ??= this.now();
                return { status: "deleted" };
            }
            case "restore_project": {
                const project = this.project(args.id);
                if (project.deletedAt !== null) {
                    if (this.projectNameTaken(project.name, project)) {
                        return { status: "nameTaken" };
                    }
                    project.deletedAt = null;
                }
                return { status: "restored" };
            }
            case "set_initiative_project": {
                const initiative = this.initiative(args.id);
                const project = this.activeProject(args.projectId);
                if (this.nameTaken(initiative.name, project.id, initiative)) {
                    return { status: "nameTaken" };
                }
                initiative.projectId = project.id;
                initiative.updatedAt = this.now();
                // A meeting follows the initiative only when it covers no other initiative.
                // Otherwise it stays in its project and no longer covers the initiative.
                for (const meeting of this.meetings) {
                    if (!meeting.initiativeIds.includes(initiative.id))
                        continue;
                    if (meeting.initiativeIds.length === 1) {
                        meeting.projectId = project.id;
                    } else {
                        meeting.initiativeIds = meeting.initiativeIds.filter(
                            (id) => id !== initiative.id,
                        );
                    }
                    meeting.updatedAt = initiative.updatedAt;
                }
                return { status: "moved", initiative: { ...initiative } };
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
                const project = this.activeProject(args.projectId);
                if (this.nameTaken(name, project.id, null)) {
                    return { status: "nameTaken" };
                }
                const now = this.now();
                const initiative: StoredInitiative = {
                    id: this.nextId++,
                    projectId: project.id,
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
                if (this.nameTaken(name, initiative.projectId, initiative)) {
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
                    if (this.project(initiative.projectId).deletedAt !== null) {
                        return { status: "projectDeleted" };
                    }
                    if (
                        this.nameTaken(
                            initiative.name,
                            initiative.projectId,
                            initiative,
                        )
                    ) {
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
