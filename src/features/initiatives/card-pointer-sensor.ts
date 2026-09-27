import type { Activators, SensorInstance, SensorProps } from "@dnd-kit/core";
import type { Coordinates } from "@dnd-kit/utilities";
import type { PointerEvent as ReactPointerEvent } from "react";

/** The options of `CardPointerSensor`. */
export type CardPointerSensorOptions = {
    /** The distance in pixels that the pointer must move before the drag starts. */
    distance: number;
};

/** The time in milliseconds after a drop in which a click on a card has no effect. */
const CLICK_BLOCK_MS = 50;

/**
 * A dnd-kit sensor that drags a card with the primary button of the pointer. The drag starts
 * only after the pointer moves `distance` pixels, so a click without movement stays a click.
 * Escape, a change of the window size, and a hidden page cancel the drag.
 *
 * After a drop, the click that ends the drag has no effect on the cards. Unlike the
 * `PointerSensor` of dnd-kit, the sensor does not block clicks outside the cards. The
 * `PointerSensor` blocks all clicks in the document for a short time after a drop. Then a
 * click on a link gets no router, and the browser opens the address of the link.
 */
export class CardPointerSensor implements SensorInstance {
    static activators: Activators<CardPointerSensorOptions> = [
        {
            eventName: "onPointerDown",
            handler: ({ nativeEvent }: ReactPointerEvent) =>
                nativeEvent.isPrimary && nativeEvent.button === 0,
        },
    ];

    autoScrollEnabled = true;

    private readonly props: SensorProps<CardPointerSensorOptions>;
    private readonly document: Document;
    private readonly window: Window;
    private readonly initial: Coordinates;
    private activated = false;

    constructor(props: SensorProps<CardPointerSensorOptions>) {
        this.props = props;
        const event = props.event as PointerEvent;
        this.document = (event.target as Node).ownerDocument ?? document;
        this.window = this.document.defaultView ?? window;
        this.initial = { x: event.clientX, y: event.clientY };
        // The listeners are on the document, because a card that moves to another column
        // gets a new element, and the old element no longer gets pointer events.
        this.document.addEventListener("pointermove", this.move, {
            passive: false,
        });
        this.document.addEventListener("pointerup", this.end);
        this.document.addEventListener("pointercancel", this.cancel);
        this.document.addEventListener("keydown", this.keydown);
        this.window.addEventListener("resize", this.cancel);
        this.window.addEventListener("visibilitychange", this.cancel);
        this.window.addEventListener("dragstart", preventDefault);
        this.window.addEventListener("contextmenu", preventDefault);
        props.onPending(
            props.active,
            { distance: props.options.distance },
            this.initial,
        );
    }

    private readonly move = (event: PointerEvent) => {
        const coordinates = { x: event.clientX, y: event.clientY };
        if (!this.activated) {
            const offset = {
                x: coordinates.x - this.initial.x,
                y: coordinates.y - this.initial.y,
            };
            if (Math.hypot(offset.x, offset.y) > this.props.options.distance) {
                this.start();
            } else {
                this.props.onPending(
                    this.props.active,
                    { distance: this.props.options.distance },
                    this.initial,
                    offset,
                );
            }
            return;
        }
        if (event.cancelable) event.preventDefault();
        this.props.onMove(coordinates);
    };

    private start() {
        this.activated = true;
        this.document.getSelection()?.removeAllRanges();
        this.document.addEventListener("selectionchange", this.clearSelection);
        this.props.onStart(this.initial);
    }

    private readonly end = () => {
        this.detach();
        if (this.activated) this.blockCardClick();
        else this.props.onAbort(this.props.active);
        this.props.onEnd();
    };

    private readonly cancel = () => {
        this.detach();
        if (!this.activated) this.props.onAbort(this.props.active);
        this.props.onCancel();
    };

    private readonly keydown = (event: KeyboardEvent) => {
        if (event.code === "Escape") this.cancel();
    };

    private readonly clearSelection = () => {
        this.document.getSelection()?.removeAllRanges();
    };

    /** Stops the click that follows the drop, if it is on a card. */
    private blockCardClick() {
        const { draggableNodes } = this.props.context.current;
        const block = (event: MouseEvent) => {
            const target = event.target as Node | null;
            for (const draggable of draggableNodes.values()) {
                if (target && draggable?.node.current?.contains(target)) {
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
            }
        };
        this.document.addEventListener("click", block, { capture: true });
        this.window.setTimeout(
            () =>
                this.document.removeEventListener("click", block, {
                    capture: true,
                }),
            CLICK_BLOCK_MS,
        );
    }

    private detach() {
        this.document.removeEventListener("pointermove", this.move);
        this.document.removeEventListener("pointerup", this.end);
        this.document.removeEventListener("pointercancel", this.cancel);
        this.document.removeEventListener("keydown", this.keydown);
        this.document.removeEventListener(
            "selectionchange",
            this.clearSelection,
        );
        this.window.removeEventListener("resize", this.cancel);
        this.window.removeEventListener("visibilitychange", this.cancel);
        this.window.removeEventListener("dragstart", preventDefault);
        this.window.removeEventListener("contextmenu", preventDefault);
    }
}

function preventDefault(event: Event) {
    event.preventDefault();
}
