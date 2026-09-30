import { describe, expect, it } from "vitest";
import { compareRanks } from "./ranks";

describe("compareRanks", () => {
    it("compareRanks sorts by character codes, not by language rules", () => {
        expect(compareRanks("81f", "c")).toBeLessThan(0);
        expect(compareRanks("c", "81f")).toBeGreaterThan(0);
        // localeCompare puts "a" before "B", but the character code of "B" is smaller.
        expect(compareRanks("B", "a")).toBeLessThan(0);
        expect(compareRanks("8", "8")).toBe(0);
    });
});
