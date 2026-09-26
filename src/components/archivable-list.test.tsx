import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchivableList } from "./archivable-list";
import { ArchiveProvider } from "./archive-provider";
import { FailureToastProvider } from "./failure-toast-provider";
import { Toaster } from "./toaster";
import { toast } from "./ui/toast";
import { useArchive, type ItemToArchive } from "./use-archive";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
});

type Item = { id: number; name: string };

/** A button that archives the given item, so a test can archive an item that the list does not show. */
function ArchiveProbe({ item }: { item: ItemToArchive }) {
    const { archive } = useArchive();
    return <button onClick={() => void archive(item)}>Probe</button>;
}

/** Renders a list of initiatives inside the providers it needs, with a probe that archives `probeItem`. */
function renderList(items: Item[], probeItem: ItemToArchive) {
    const fallbackFocusRef = createRef<HTMLButtonElement>();
    render(
        <MemoryRouter>
            <Toaster toastManager={toast}>
                <FailureToastProvider>
                    <ArchiveProvider>
                        <ArchiveProbe item={probeItem} />
                        <button ref={fallbackFocusRef}>Fallback</button>
                        <ArchivableList<Item>
                            kind="initiative"
                            load={() => Promise.resolve(items)}
                            itemPath={(item) => `/initiatives/${item.id}`}
                            displayName={(name) => name}
                            detail={() => "Detail"}
                            emptyText="No initiatives yet"
                            loadErrorText="Couldn't load initiatives"
                            archiveFailureMessage="Couldn't archive the initiative. Try again."
                            fallbackFocusRef={fallbackFocusRef}
                        />
                    </ArchiveProvider>
                </FailureToastProvider>
            </Toaster>
        </MemoryRouter>,
    );
}

/** Archives the probe's item, then clicks Undo in the archive toast without moving focus. */
async function archiveAndRestoreWithProbe() {
    const probe = screen.getByRole("button", { name: "Probe" });
    probe.focus();
    await act(async () => {
        fireEvent.click(probe);
    });
    const toasts = screen.getByRole("region", { name: "Notifications" });
    const undo = await within(toasts).findByRole("button", { name: "Undo" });
    await act(async () => {
        fireEvent.click(undo);
    });
    return probe;
}

describe("ArchivableList", () => {
    it("moves focus to the link of a restored item of its kind", async () => {
        renderList([{ id: 1, name: "Launch" }], {
            kind: "initiative",
            id: 1,
            name: "Launch",
        });
        const link = await screen.findByRole("link", { name: /Launch/ });

        await archiveAndRestoreWithProbe();

        await vi.waitFor(() => expect(link).toHaveFocus());
    });

    it("ignores a restore of the other kind", async () => {
        renderList([{ id: 1, name: "Launch" }], {
            kind: "meeting",
            id: 1,
            name: "Standup",
        });
        const link = await screen.findByRole("link", { name: /Launch/ });

        const probe = await archiveAndRestoreWithProbe();

        await vi.waitFor(() =>
            expect(invoke).toHaveBeenCalledWith("unarchive_meeting", {
                id: 1,
            }),
        );
        // Lets the list reload after the restore, so the effect that focuses a
        // restored link has a loaded list to act on.
        await act(async () => {});
        expect(await screen.findByRole("link", { name: /Launch/ })).toBe(link);
        expect(link).not.toHaveFocus();
        expect(probe).toHaveFocus();
    });
});
