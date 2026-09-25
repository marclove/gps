import { describe, expect, it } from "vitest";
import { formatMeetingDate, toMeetingDate } from "./dates";

describe("formatMeetingDate", () => {
    it("formats the date in the medium style of the locale, on the same day", () => {
        const expected = new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
        }).format(new Date(2026, 8, 24));
        expect(formatMeetingDate("2026-09-24")).toBe(expected);
    });

    it("returns text that is not a meeting date unchanged", () => {
        expect(formatMeetingDate("")).toBe("");
        expect(formatMeetingDate("soon")).toBe("soon");
    });
});

describe("toMeetingDate", () => {
    it("uses the local calendar date", () => {
        expect(toMeetingDate(new Date(2026, 8, 24, 23, 59))).toBe("2026-09-24");
        expect(toMeetingDate(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
    });
});
