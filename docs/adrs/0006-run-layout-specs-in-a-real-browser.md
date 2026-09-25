# 6. Run layout specs in a real browser engine

Date: 2026-09-25

## Status

Accepted

## Context

Our frontend tests use Vitest with jsdom. jsdom is a JavaScript model of a web page that runs in Node.js. It is fast, but it does not calculate layout, and our tests do not load the application's CSS. In jsdom, every element has a size and position of zero, and nothing scrolls.

ADR 0005 makes the page chrome, such as the page header and the formatting toolbar, stay in place while an area of the page scrolls. Whether that works depends only on CSS: the height of the shell, the sizes of grid rows, `min-height: 0`, and `overflow`. A jsdom test can check which element contains which, but it cannot find a mistake in the CSS, such as a missing `min-height: 0`. Our feature specs must show that the behavior works, so they need a real browser engine for this kind of behavior.

On macOS, Tauri shows the application in WKWebView, the web view of the operating system, which uses the WebKit engine. An end to end test harness for the desktop application itself is not part of this decision.

## Decision

- We use Vitest browser mode with the Playwright provider (`@vitest/browser-playwright` and `playwright`) to run some specs in a real browser engine. The engine is WebKit, the engine that is closest to the web view that the application uses on macOS. The browser runs headless, with a viewport of 1200 by 800 pixels, which is the default window size.
- Browser specs are named `*.browser.spec.tsx`. They load the application's CSS (`src/index.css`) and replace the Tauri backend with a fake through `vi.mock`, like the jsdom specs.
- The Vitest configuration has two projects. The `unit` project runs all other `*.test.*` and `*.spec.*` files in jsdom, as before. The `browser` project runs only the `*.browser.spec.tsx` files in WebKit. `bun run test` runs both projects.
- We write browser specs only for behavior that jsdom cannot show, such as layout, scrolling, and positions on the screen. All other behavior stays in jsdom tests, which are faster.
- Continuous integration installs WebKit and the system libraries that it needs with `bunx playwright install --with-deps webkit` before it runs the checks. On a development computer, `bunx playwright install webkit` installs the browser once.

## Consequences

- Layout behavior is checked automatically, with the application's real CSS, in the same test run as all other specs.
- The browser specs start more slowly than jsdom tests, and the test run needs a browser that Playwright downloads, of about 80 MB. A new development computer must install it once before `bun run test` can pass.
- The Playwright WebKit build is close to Safari and WKWebView, but it is not the same program. A difference between them can still cause a problem that only the desktop application shows.
- The version of `@vitest/browser-playwright` must match the version of `vitest`. They are updated together.

## Alternatives considered

- Check only the structure in jsdom, for example that the notes are inside a scrolling area and the toolbar is outside it. There is no new tooling, but a mistake in the CSS passes the test.
- Chromium instead of WebKit. Chromium is the most common engine for browser tests, but the application does not run in it on macOS.
- An end to end test harness for the desktop application, such as WebDriver with `tauri-driver`. It tests the real application, but Tauri does not support WebDriver on macOS, and the tests would need a built application.
