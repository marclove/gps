import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
    cleanup();
});

// jsdom does not implement layout. The stubs below give the browser APIs that
// the sidebar and the rich text editor call a harmless result.

// The sidebar uses matchMedia to decide if the window is narrow.
window.matchMedia = (query: string) =>
    ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    }) as MediaQueryList;

// The editor measures text positions when it scrolls to or reads the selection.
Range.prototype.getClientRects = () =>
    ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
document.elementFromPoint = () => null;
