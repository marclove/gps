/**
 * An in-memory fake of the backend commands for projects, meetings, initiatives, and
 * tasks. The feature specs and some unit tests use it in place of the Tauri backend.
 *
 * The fake keeps the order of initiatives and tasks as the real backend does. Each
 * initiative on the roadmap and each prioritized task has a rank, which is a text key.
 * A change gives only the changed row a new rank, between the ranks of its new neighbors.
 * The keys are not the keys that the real backend makes.
 *
 * The stage of a task comes from its columns. A deleted task is on no board. A task with
 * `completedAt` is in Done. A task with no rank is in the Icebox. A task with a rank and
 * `startedAt` is in Current. Other tasks are in the Backlog. A completed or deleted task
 * keeps its rank and its start, so that it can go back to its held place.
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

export type StoredTask = {
    id: number;
    meetingId: number | null;
    title: string;
    description: string;
    projectId: number | null;
    initiativeId: number | null;
    /** The place in the list, or `null` when the task is in the Icebox. */
    rank: string | null;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    deletedAt: string | null;
};

/** A column of the board of the Work page. */
export type TaskStage = "current" | "backlog" | "icebox" | "done";

export type SeedTask = {
    title: string;
    /**
     * The meeting that the task came from. When `project` and `initiative` are not given,
     * the task gets them from the meeting, as `create_meeting_task` does.
     */
    meeting?: StoredMeeting;
    /** The project. By default, the project of `initiative`, or of `meeting`, or none. */
    project?: StoredProject | null;
    initiative?: StoredInitiative | null;
    description?: string;
    /**
     * The column. By default, "icebox". A task in "current" or "backlog" goes after every
     * task that was seeded before it, so that the list is in the order of seeding. A task in "current" gets `startedAt`. A task in "done" gets `completedAt`.
     */
    stage?: TaskStage;
    /**
     * For a task in "done" only: the stage that the task goes back to when it is reopened.
     * By default, "icebox". With "current" or "backlog", the task holds a place after every
     * task that was seeded before it.
     */
    heldStage?: "current" | "backlog" | "icebox";
    /** The rank. By default, the rank that `stage` and `heldStage` give. */
    rank?: string | null;
    createdAt?: string;
    startedAt?: string | null;
    completedAt?: string | null;
    /** When true, the task is deleted. `deletedAt` gives the time. */
    deleted?: boolean;
    deletedAt?: string | null;
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
    | "delete_meeting"
    | "list_meeting_tasks"
    | "list_tasks"
    | "get_task"
    | "create_task"
    | "create_meeting_task"
    | "update_task_title"
    | "update_task_description"
    | "set_task_project"
    | "set_task_initiative"
    | "move_task"
    | "start_task"
    | "set_task_completed"
    | "delete_task"
    | "restore_task";

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

export class FakeBackend {
    projects: StoredProject[] = [];
    initiatives: StoredInitiative[] = [];
    meetings: StoredMeeting[] = [];
    tasks: StoredTask[] = [];
    /** The commands that reject with "database is locked" until removed from this set. */
    failing = new Set<FailingCommand>();
    /** The commands that reject once, and then work again. */
    failingOnce = new Set<FailingCommand>();
    private nextId = 1;
    // Projects count their own identifiers, as a table of the real database does, so that
    // seeding a project does not change the identifiers of initiatives and meetings.
    private nextProjectId = 1;
    // Tasks count their own identifiers too.
    private nextTaskId = 1;
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

    /** Returns the stage of a task, or "deleted" for a deleted task. */
    stageOf(task: StoredTask): TaskStage | "deleted" {
        if (task.deletedAt !== null) return "deleted";
        if (task.completedAt !== null) return "done";
        if (task.rank === null) return "icebox";
        return task.startedAt !== null ? "current" : "backlog";
    }

    /** The prioritized tasks in Current and the Backlog, in the order of the list. */
    private list(): (StoredTask & { rank: string })[] {
        return this.tasks
            .filter(
                (t): t is StoredTask & { rank: string } =>
                    t.rank !== null &&
                    t.completedAt === null &&
                    t.deletedAt === null,
            )
            .sort(byRank);
    }

    /**
     * The key after the largest rank of all tasks, also completed and deleted ones, so that
     * each seeded task holds its own place.
     */
    private afterAllTasks(): string {
        const ranks = this.tasks
            .map((t) => t.rank)
            .filter((rank) => rank !== null)
            .sort();
        return keyBetween(ranks[ranks.length - 1] ?? null, null);
    }

    /**
     * Puts the task in Current or the Backlog at the index among the other cards of that
     * column. The task goes directly after the card above the index, or directly before the
     * card below it when the index is 0, or to the end of the list when the column has no
     * other card.
     */
    private placeTask(
        task: StoredTask,
        stage: "current" | "backlog",
        index: number,
    ) {
        const list = this.list().filter((t) => t !== task);
        const column = list.filter((t) =>
            stage === "current" ? t.startedAt !== null : t.startedAt === null,
        );
        const at = Math.min(Math.max(index, 0), column.length);
        const above = column[at - 1];
        const below = column[at];
        if (above) {
            const next = list[list.indexOf(above) + 1];
            task.rank = keyBetween(above.rank, next?.rank ?? null);
        } else if (below) {
            const previous = list[list.indexOf(below) - 1];
            task.rank = keyBetween(previous?.rank ?? null, below.rank);
        } else {
            task.rank = keyBetween(list[list.length - 1]?.rank ?? null, null);
        }
    }

    /**
     * Gives a reopened or restored task a new rank if a task of the list has its rank: the
     * new rank is directly after that task.
     */
    private keepTaskPlace(task: StoredTask) {
        if (task.rank === null) return;
        const list = this.list().filter((t) => t !== task);
        const holder = list.findIndex((t) => t.rank === task.rank);
        if (holder === -1) return;
        task.rank = keyBetween(
            list[holder].rank,
            list[holder + 1]?.rank ?? null,
        );
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

    /** Seeds a task. See `SeedTask` for the defaults. */
    seedTask(fields: SeedTask): StoredTask {
        const stage = fields.stage ?? "icebox";
        const held = stage === "done" ? (fields.heldStage ?? "icebox") : stage;
        const meeting = fields.meeting ?? null;
        let initiative = fields.initiative;
        if (initiative === undefined) {
            const covered =
                meeting?.initiativeIds
                    .map((id) => this.initiative(id))
                    .filter((i) => i.deletedAt === null) ?? [];
            initiative =
                fields.project === undefined && covered.length === 1
                    ? covered[0]
                    : null;
        }
        const projectId =
            fields.project !== undefined
                ? (fields.project?.id ?? null)
                : (initiative?.projectId ?? meeting?.projectId ?? null);
        const createdAt = fields.createdAt ?? this.now();
        const rank =
            fields.rank !== undefined
                ? fields.rank
                : held === "icebox"
                  ? null
                  : this.afterAllTasks();
        const task: StoredTask = {
            id: this.nextTaskId++,
            meetingId: meeting?.id ?? null,
            title: fields.title,
            description: fields.description ?? "",
            projectId,
            initiativeId: initiative?.id ?? null,
            rank,
            createdAt,
            updatedAt: createdAt,
            startedAt:
                fields.startedAt !== undefined
                    ? fields.startedAt
                    : held === "current"
                      ? createdAt
                      : null,
            completedAt:
                fields.completedAt !== undefined
                    ? fields.completedAt
                    : stage === "done"
                      ? this.now()
                      : null,
            deletedAt:
                fields.deletedAt !== undefined
                    ? fields.deletedAt
                    : fields.deleted
                      ? this.now()
                      : null,
        };
        this.tasks.push(task);
        return task;
    }

    /**
     * The titles of the tasks in the column of the Work page, from the top. Current and the
     * Backlog are in the order of the list. The Icebox has the newest task first. Done has
     * the task that was completed last first.
     */
    workColumn(stage: TaskStage): string[] {
        if (stage === "current" || stage === "backlog") {
            return this.list()
                .filter((t) => this.stageOf(t) === stage)
                .map((t) => t.title);
        }
        const key = stage === "icebox" ? "createdAt" : "completedAt";
        return this.tasks
            .filter((t) => this.stageOf(t) === stage)
            .sort((a, b) => b[key]!.localeCompare(a[key]!) || b.id - a.id)
            .map((t) => t.title);
    }

    /** The titles of the tasks in Current and the Backlog, in the order of the list. */
    listOrder(): string[] {
        return this.list().map((t) => t.title);
    }

    findTask(title: string): StoredTask {
        const task = this.tasks.find((t) => t.title === title);
        if (!task) throw new Error(`no task named ${title}`);
        return task;
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

    private task(id: unknown): StoredTask {
        const task = this.tasks.find((t) => t.id === id);
        if (!task) throw `task ${String(id)} not found`;
        return task;
    }

    /** Returns the initiative, and throws if it does not exist or is deleted. */
    private activeInitiative(id: unknown): StoredInitiative {
        const initiative = this.initiative(id);
        if (initiative.deletedAt !== null)
            throw `initiative ${String(id)} is deleted`;
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

    /** Stores a new task in the Icebox and returns a copy of it. */
    private addTask(
        fields: Pick<
            StoredTask,
            "meetingId" | "title" | "description" | "projectId" | "initiativeId"
        >,
    ): StoredTask {
        const now = this.now();
        const task: StoredTask = {
            id: this.nextTaskId++,
            ...fields,
            rank: null,
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            completedAt: null,
            deletedAt: null,
        };
        this.tasks.push(task);
        return { ...task };
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
                return this.tasks
                    .filter(
                        (t) =>
                            t.meetingId === args.meetingId &&
                            t.deletedAt === null,
                    )
                    .sort(
                        (a, b) =>
                            a.createdAt.localeCompare(b.createdAt) ||
                            a.id - b.id,
                    )
                    .map((t) => ({ ...t }));
            case "list_tasks":
                // The order is on purpose not the order of the board, because the
                // frontend sorts the tasks.
                return [...this.tasks]
                    .reverse()
                    .filter((t) => t.deletedAt === null)
                    .map((t) => ({ ...t }));
            case "get_task": {
                const task = this.tasks.find((t) => t.id === args.id);
                return task ? { ...task } : null;
            }
            case "create_task": {
                let projectId = args.projectId as number | null;
                const initiativeId = args.initiativeId as number | null;
                if (initiativeId !== null) {
                    projectId = this.activeInitiative(initiativeId).projectId;
                } else if (projectId !== null) {
                    this.activeProject(projectId);
                }
                return this.addTask({
                    meetingId: null,
                    title: (args.title as string).trim(),
                    description: args.description as string,
                    projectId,
                    initiativeId,
                });
            }
            case "create_meeting_task": {
                const meeting = this.meeting(args.meetingId);
                const covered = meeting.initiativeIds.filter(
                    (id) => this.initiative(id).deletedAt === null,
                );
                return this.addTask({
                    meetingId: meeting.id,
                    title: args.title as string,
                    description: "",
                    projectId:
                        meeting.projectId !== null &&
                        this.project(meeting.projectId).deletedAt === null
                            ? meeting.projectId
                            : null,
                    initiativeId: covered.length === 1 ? covered[0] : null,
                });
            }
            case "update_task_title": {
                const task = this.task(args.id);
                task.title = args.title as string;
                task.updatedAt = this.now();
                return { ...task };
            }
            case "update_task_description": {
                const task = this.task(args.id);
                task.description = args.description as string;
                task.updatedAt = this.now();
                return { ...task };
            }
            case "set_task_project": {
                const task = this.task(args.id);
                const projectId = args.projectId as number | null;
                if (projectId === null) {
                    task.projectId = null;
                    task.initiativeId = null;
                } else {
                    this.activeProject(projectId);
                    task.projectId = projectId;
                    if (
                        task.initiativeId !== null &&
                        this.initiative(task.initiativeId).projectId !==
                            projectId
                    ) {
                        task.initiativeId = null;
                    }
                }
                task.updatedAt = this.now();
                return { ...task };
            }
            case "set_task_initiative": {
                const task = this.task(args.id);
                const initiativeId = args.initiativeId as number | null;
                if (initiativeId !== null) {
                    task.projectId =
                        this.activeInitiative(initiativeId).projectId;
                }
                task.initiativeId = initiativeId;
                task.updatedAt = this.now();
                return { ...task };
            }
            case "move_task": {
                const task = this.task(args.id);
                if (task.deletedAt !== null) {
                    throw `task ${String(task.id)} is deleted`;
                }
                if (task.completedAt !== null) {
                    throw `task ${String(task.id)} is completed`;
                }
                const destination = args.destination as TaskStage;
                if (destination === "done") {
                    task.completedAt = this.now();
                } else if (destination === "icebox") {
                    task.rank = null;
                    task.startedAt = null;
                } else {
                    this.placeTask(task, destination, args.index as number);
                    task.startedAt =
                        destination === "current"
                            ? (task.startedAt ?? this.now())
                            : null;
                }
                return { ...task };
            }
            case "start_task": {
                const task = this.task(args.id);
                if (this.stageOf(task) !== "backlog") {
                    throw `task ${String(task.id)} is not in the backlog`;
                }
                task.startedAt = this.now();
                return { ...task };
            }
            case "set_task_completed": {
                const task = this.task(args.id);
                if (args.completed === true) {
                    task.completedAt ??= this.now();
                } else if (task.completedAt !== null) {
                    task.completedAt = null;
                    if (task.deletedAt === null) this.keepTaskPlace(task);
                }
                return { ...task };
            }
            case "delete_task": {
                const task = this.task(args.id);
                task.deletedAt ??= this.now();
                return null;
            }
            case "restore_task": {
                const task = this.task(args.id);
                if (task.deletedAt !== null) {
                    task.deletedAt = null;
                    if (task.completedAt === null) this.keepTaskPlace(task);
                }
                return { ...task };
            }
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
                if (
                    this.tasks.some(
                        (t) =>
                            t.projectId === project.id && t.deletedAt === null,
                    )
                ) {
                    return { status: "hasTasks" };
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
                // The tasks of the initiative follow it, also completed and deleted ones.
                for (const task of this.tasks) {
                    if (task.initiativeId === initiative.id) {
                        task.projectId = project.id;
                    }
                }
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
