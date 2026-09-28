import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Toaster } from "@/components/toaster";
import { toast, useToastManager } from "@/components/ui/toast";
import { FailureToastProvider } from "./failure-toast-provider";
import { useFailureToast } from "./use-failure-toast";

// Checks that the user can read both toasts and reach both Close buttons when an
// delete toast and a failure toast are open together. This depends on the layout of
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

const DELETED = 'Deleted "Standup".';
const FAILURE = "Couldn't delete the meeting. Try again.";

beforeEach(async () => {
    await page.viewport(1200, 800);
});

describe("Stacked toasts", () => {
    it("shows both messages and both Close buttons when a delete toast and a failure toast are open", async () => {
        const api = renderHarness();

        act(() => {
            api().manager.add({
                title: DELETED,
                timeout: 0,
                actionProps: { children: "Undo" },
            });
        });
        await within(notifications()).findByText(DELETED);
        act(() => api().failure.show(FAILURE));
        await within(notifications()).findByText(FAILURE);

        const deleted = within(notifications()).getByText(DELETED);
        const failure = within(notifications()).getByText(FAILURE);
        const closeOf = (text: HTMLElement) =>
            within(
                text.closest("[data-slot='toast']") as HTMLElement,
            ).getByRole("button", { name: "Close" });

        await expect
            .poll(
                () => ({
                    deleted: isOnTop(deleted),
                    failure: isOnTop(failure),
                    deletedClose: isOnTop(closeOf(deleted)),
                    failureClose: isOnTop(closeOf(failure)),
                }),
                SETTLE_TIMEOUT,
            )
            .toEqual({
                deleted: true,
                failure: true,
                deletedClose: true,
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
        const deletedClose = closeOf(
            within(notifications()).getByText(DELETED),
        );
        await expect
            .poll(() => isOnTop(deletedClose), SETTLE_TIMEOUT)
            .toBe(true);
        await userEvent.click(deletedClose);
        await waitFor(
            () =>
                expect(
                    within(notifications()).queryByText(DELETED),
                ).not.toBeInTheDocument(),
            SETTLE_TIMEOUT,
        );
    });
});
