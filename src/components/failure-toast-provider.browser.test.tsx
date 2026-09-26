import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Toaster } from "@/components/toaster";
import { toast, useToastManager } from "@/components/ui/toast";
import { FailureToastProvider } from "./failure-toast-provider";
import { useFailureToast } from "./use-failure-toast";

// Checks that the user can read both toasts and reach both Close buttons when an
// archive toast and a failure toast are open together. This depends on the layout of
// the stacked toasts, so it runs in WebKit with the application's CSS.

type Api = {
    failure: ReturnType<typeof useFailureToast>;
    manager: ReturnType<typeof useToastManager>;
};

/** Hands the failure toast actions and the toast manager to the test. */
function Harness({ onReady }: { onReady: (api: Api) => void }) {
    const failure = useFailureToast();
    const manager = useToastManager();
    onReady({ failure, manager });
    return null;
}

function renderHarness() {
    const ref: { current: Api | null } = { current: null };
    render(
        <Toaster toastManager={toast}>
            <FailureToastProvider>
                <Harness
                    onReady={(api) => {
                        ref.current = api;
                    }}
                />
            </FailureToastProvider>
        </Toaster>,
    );
    return () => ref.current!;
}

/** The region that holds the toasts. */
function notifications() {
    return screen.getByRole("region", { name: "Notifications" });
}

/** Whether the element is the topmost element at the center of its box. */
function isOnTop(element: Element): boolean {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
    );
    return hit !== null && (hit === element || element.contains(hit));
}

/** How long to wait for the toasts to finish moving, in milliseconds. */
const SETTLE_TIMEOUT = { timeout: 4000 };

const ARCHIVED = 'Archived "Standup".';
const FAILURE = "Couldn't archive the meeting. Try again.";

beforeEach(async () => {
    await page.viewport(1200, 800);
});

describe("Stacked toasts", () => {
    it("shows both messages and both Close buttons when an archive toast and a failure toast are open", async () => {
        const api = renderHarness();

        act(() => {
            api().manager.add({
                title: ARCHIVED,
                timeout: 0,
                actionProps: { children: "Undo" },
            });
        });
        await within(notifications()).findByText(ARCHIVED);
        act(() => api().failure.show(FAILURE));
        await within(notifications()).findByText(FAILURE);

        const archived = within(notifications()).getByText(ARCHIVED);
        const failure = within(notifications()).getByText(FAILURE);
        const closeOf = (text: HTMLElement) =>
            within(
                text.closest("[data-slot='toast']") as HTMLElement,
            ).getByRole("button", { name: "Close" });

        await expect
            .poll(
                () => ({
                    archived: isOnTop(archived),
                    failure: isOnTop(failure),
                    archivedClose: isOnTop(closeOf(archived)),
                    failureClose: isOnTop(closeOf(failure)),
                }),
                SETTLE_TIMEOUT,
            )
            .toEqual({
                archived: true,
                failure: true,
                archivedClose: true,
                failureClose: true,
            });

        await userEvent.click(closeOf(failure));
        await waitFor(
            () =>
                expect(
                    within(notifications()).queryByText(FAILURE),
                ).not.toBeInTheDocument(),
            SETTLE_TIMEOUT,
        );
        const archivedClose = closeOf(
            within(notifications()).getByText(ARCHIVED),
        );
        await expect
            .poll(() => isOnTop(archivedClose), SETTLE_TIMEOUT)
            .toBe(true);
        await userEvent.click(archivedClose);
        await waitFor(
            () =>
                expect(
                    within(notifications()).queryByText(ARCHIVED),
                ).not.toBeInTheDocument(),
            SETTLE_TIMEOUT,
        );
    });
});
