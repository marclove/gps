import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Toaster } from "@/components/toaster";
import { toast, useToastManager } from "@/components/ui/toast";
import { FailureToastProvider } from "./failure-toast-provider";
import { useFailureToast } from "./use-failure-toast";

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

/** Renders the toast provider, then the failure toast provider, around the harness. */
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

describe("FailureToastProvider", () => {
    it("shows the message in the Notifications region with only a Close button", async () => {
        const api = renderHarness();

        act(() => api().failure.show("Couldn't do it. Try again."));

        expect(
            await within(notifications()).findByText(
                "Couldn't do it. Try again.",
            ),
        ).toBeInTheDocument();
        expect(
            within(notifications())
                .getAllByRole("button")
                .map((button) => button.getAttribute("aria-label")),
        ).toEqual(["Close"]);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(api().manager.toasts).toEqual([
            expect.objectContaining({ timeout: 8000 }),
        ]);
    });

    it("replaces the open failure toast when another failure is shown", async () => {
        const api = renderHarness();

        act(() => api().failure.show("First failure."));
        await within(notifications()).findByText("First failure.");
        act(() => api().failure.show("Second failure."));

        expect(
            await within(notifications()).findByText("Second failure."),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(
                within(notifications()).queryByText("First failure."),
            ).not.toBeInTheDocument(),
        );
    });

    it("closes the failure toast on clear", async () => {
        const api = renderHarness();

        act(() => api().failure.show("A failure."));
        await within(notifications()).findByText("A failure.");
        act(() => api().failure.clear());

        await waitFor(() =>
            expect(
                within(notifications()).queryByText("A failure."),
            ).not.toBeInTheDocument(),
        );
    });

    it("closes the failure toast when its Close button is clicked", async () => {
        const user = userEvent.setup();
        const api = renderHarness();

        act(() => api().failure.show("A failure."));
        await within(notifications()).findByText("A failure.");
        await user.click(
            within(notifications()).getByRole("button", { name: "Close" }),
        );

        await waitFor(() =>
            expect(
                within(notifications()).queryByText("A failure."),
            ).not.toBeInTheDocument(),
        );
    });

    it("keeps an archive toast open when a failure toast opens", async () => {
        const api = renderHarness();

        act(() => {
            api().manager.add({ title: 'Archived "Standup".' });
        });
        await within(notifications()).findByText('Archived "Standup".');
        act(() => api().failure.show("A failure."));

        expect(
            await within(notifications()).findByText("A failure."),
        ).toBeInTheDocument();
        expect(
            within(notifications()).getByText('Archived "Standup".'),
        ).toBeInTheDocument();
    });
});
