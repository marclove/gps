import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@/index.css";

// Browser specs check layout, so they load the application's CSS.

afterEach(() => {
    cleanup();
});
