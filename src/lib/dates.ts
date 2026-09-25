/**
 * Returns a meeting date (`YYYY-MM-DD`) written for people, in the medium date style of
 * the user's locale, such as "Sep 24, 2026". Returns the text unchanged if it is not a
 * meeting date.
 */
export function formatMeetingDate(date: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return date;
    const [, year, month, day] = match;
    // Construct the date in the local time zone. `new Date("2026-09-24")` is midnight
    // UTC, which is the previous day in time zones west of UTC.
    const local = new Date(Number(year), Number(month) - 1, Number(day));
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        local,
    );
}
