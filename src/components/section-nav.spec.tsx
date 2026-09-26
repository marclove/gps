import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import tauriConfig from "../../src-tauri/tauri.conf.json";

// Feature spec for docs/specs/0003-compact-section-nav.md.
// The Tauri backend is replaced by an in-memory fake with one meeting. Layout,
// such as the width of the section navigation, is checked in
// section-nav.browser.spec.tsx.

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const MEETING = {
    id: 1,
    name: "Weekly sync",
    date: "2026-09-24",
    notes: "",
    createdAt: "2026-09-24T10:00:00.000Z",
    updatedAt: "2026-09-24T10:00:00.000Z",
};

async function handle(command: string, args: Record<string, unknown> = {}) {
    switch (command) {
        case "list_meetings":
            return [
                {
                    id: MEETING.id,
                    name: MEETING.name,
                    date: MEETING.date,
                    updatedAt: MEETING.updatedAt,
                },
            ];
        case "get_meeting":
            return args.id === MEETING.id ? MEETING : null;
        case "update_meeting":
            return { ...MEETING, ...args };
        default:
            throw `unexpected command ${command}`;
    }
}

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(handle);
});

function renderApp() {
    const user = userEvent.setup();
    render(<App />);
    return user;
}

function meetingsLink() {
    return within(screen.getByRole("navigation", { name: "Main" })).getByRole(
        "link",
        { name: "Meetings" },
    );
}

async function openMeeting(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("link", { name: /Weekly sync/ }));
    await screen.findByRole("textbox", { name: "Notes" });
}

describe("Compact navigation between sections", () => {
    it("shows each section as an icon", () => {
        renderApp();

        expect(meetingsLink().querySelector("svg")).toBeInTheDocument();
    });

    it("shows the section's name when the pointer rests on its icon", async () => {
        const user = renderApp();

        await user.hover(meetingsLink());

        expect(await screen.findByRole("tooltip")).toHaveTextContent(
            "Meetings",
        );
    });

    it("marks the current section on the Meetings page", async () => {
        renderApp();
        await screen.findByRole("link", { name: /Weekly sync/ });

        expect(meetingsLink()).toHaveAttribute("aria-current", "page");
    });

    it("marks the current section on a page inside it", async () => {
        const user = renderApp();

        await openMeeting(user);

        expect(meetingsLink()).toHaveAttribute("aria-current", "page");
    });

    it("has no button that shows or hides the navigation", async () => {
        const user = renderApp();
        expect(
            screen.queryByRole("button", { name: /sidebar/i }),
        ).not.toBeInTheDocument();

        await openMeeting(user);

        expect(
            screen.queryByRole("button", { name: /sidebar/i }),
        ).not.toBeInTheDocument();
    });
});

describe("Window", () => {
    it("keeps the macOS title bar above the content, with its own background color", () => {
        const [mainWindow] = tauriConfig.app.windows;

        expect(mainWindow.titleBarStyle).toBe("Transparent");
        expect(mainWindow).not.toHaveProperty("hiddenTitle");
        expect(mainWindow).not.toHaveProperty("trafficLightPosition");
        expect(mainWindow.title).toBe("gps");
    });

    it("uses the light appearance, so the title stays readable on the light title bar", () => {
        const [mainWindow] = tauriConfig.app.windows;

        expect(mainWindow.theme).toBe("Light");
    });
});
