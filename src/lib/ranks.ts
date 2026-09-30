/**
 * Compares two ranks by the codes of their characters, and not by the rules of a language.
 * Returns -1 if `a` sorts first, 1 if `b` sorts first, and 0 if they are equal. The backend
 * makes all ranks, and the frontend only compares them.
 */
export function compareRanks(a: string, b: string): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}
