import { screen } from "@testing-library/react";

/**
 * Helpers that drag roadmap cards with the pointer in browser tests.
 *
 * WebKit on Linux can take several hundred milliseconds to draw a frame. The drag and drop
 * code finds the place under the pointer when the browser draws, so these helpers move the
 * pointer one step per frame, and release it only when the board says that the card is over
 * the expected column. A test then does not depend on how fast the browser draws.
 */

/** Returns the center of the element, in the coordinates of the window. */
export function center(element: Element) {
    const { left, top, width, height } = element.getBoundingClientRect();
    return { x: left + width / 2, y: top + height / 2 };
}

/** Sends a pointer event of the primary mouse button to `target`. */
export function pointer(
    type: string,
    target: EventTarget,
    x: number,
    y: number,
) {
    target.dispatchEvent(
        new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            isPrimary: true,
            pointerId: 1,
            pointerType: "mouse",
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: x,
            clientY: y,
        }),
    );
}

/** Returns a promise that resolves after the browser draws the next frame. */
export function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
}

/** The time to wait for a message about the dragged card. Frames can be slow. */
const MESSAGE_TIMEOUT = 5000;

/**
 * Waits until the message for screen readers says that the card is in the column, for
 * example "A is in Next, position 2 of 3.".
 */
export async function waitForCardInColumn(column: string) {
    await screen.findByText(
        (text) =>
            new RegExp(` is in ${column}, position \\d+ of \\d+\\.$`).test(
                text,
            ),
        undefined,
        { timeout: MESSAGE_TIMEOUT },
    );
}

/**
 * Drags `source` with the pointer to the center of `target`, in 10 steps with a frame after
 * each step, and drops it when the board says that the card is over the column of `target`.
 * The column is the region with a name that contains `target`.
 */
export async function dragWithPointer(source: Element, target: Element) {
    const column = target
        .closest("section[aria-label]")
        ?.getAttribute("aria-label");
    if (!column)
        throw new Error("The target is not in a column of the roadmap.");
    const start = center(source);
    const end = center(target);

    pointer("pointerdown", source, start.x, start.y);
    for (let step = 1; step <= 10; step++) {
        pointer(
            "pointermove",
            document,
            start.x + ((end.x - start.x) * step) / 10,
            start.y + ((end.y - start.y) * step) / 10,
        );
        await nextFrame();
    }
    await waitForCardInColumn(column);
    await nextFrame();
    pointer("pointerup", document, end.x, end.y);
}
