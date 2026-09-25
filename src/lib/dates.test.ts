import { describe, expect, it } from "vitest";
import { formatMeetingDate } from "./dates";

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
