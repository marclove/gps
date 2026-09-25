import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
    const mql = window.matchMedia(MOBILE_QUERY);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
}

/** Returns true when the window is narrower than the mobile breakpoint. */
export function useIsMobile() {
    return React.useSyncExternalStore(
        subscribe,
        () => window.matchMedia(MOBILE_QUERY).matches,
        () => false,
    );
}
