import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Two projects: `unit` runs in jsdom, and `browser` runs the `*.browser.spec.tsx` files
// in a real WebKit engine, because jsdom does not calculate layout.
export default mergeConfig(
    viteConfig({ command: "serve", mode: "test" }),
    defineConfig({
        test: {
            coverage: {
                provider: "v8",
                include: ["src/**/*.{ts,tsx}"],
                exclude: ["src/test/**", "src/**/*.d.ts", "src/main.tsx"],
            },
            projects: [
                {
                    extends: true,
                    test: {
                        name: "unit",
                        environment: "jsdom",
                        setupFiles: ["./src/test/setup.ts"],
                        include: ["src/**/*.{test,spec}.{ts,tsx}"],
                        exclude: ["src/**/*.browser.spec.tsx"],
                    },
                },
                {
                    extends: true,
                    test: {
                        name: "browser",
                        setupFiles: ["./src/test/browser-setup.ts"],
                        include: ["src/**/*.browser.spec.tsx"],
                        browser: {
                            enabled: true,
                            provider: playwright(),
                            headless: true,
                            instances: [{ browser: "webkit" }],
                            // The default window size of the application.
                            viewport: { width: 1200, height: 800 },
                        },
                    },
                },
            ],
        },
    }),
);
