/**
 * The classes for the title of a page, such as the "Meetings" heading or the meeting
 * name field. Use the same classes for every page title, so that titles have the same
 * size and position on every page.
 *
 * `md:text-3xl` is necessary on an `Input`, because the base `Input` sets `md:text-sm`.
 * `py-1` gives a heading the same vertical padding as an `Input`.
 */
export const PAGE_TITLE_CLASSES = "py-1 text-3xl font-semibold md:text-3xl";
