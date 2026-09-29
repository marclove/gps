/**
 * Returns the column that holds the card with the identifier, or `null` if no column holds it.
 * `cards` has the cards of each column.
 */
export function columnOf<K extends string, C extends { id: number }>(
    cards: Record<K, C[]>,
    id: number,
): K | null {
    return (
        (Object.keys(cards) as K[]).find((column) =>
            cards[column].some((card) => card.id === id),
        ) ?? null
    );
}

/**
 * Returns the columns with the card moved to the column `to`, at the place `index` in that
 * column, counted without the card. An index larger than the column puts the card at the end.
 * If no column holds the card, the function returns the columns that it gets. The function does
 * not change the columns that it gets.
 */
export function moveCard<K extends string, C extends { id: number }>(
    cards: Record<K, C[]>,
    id: number,
    to: NoInfer<K>,
    index: number,
): Record<K, C[]> {
    const from = columnOf(cards, id);
    if (from === null) return cards;
    const card = cards[from].find((candidate) => candidate.id === id)!;
    const next: Record<K, C[]> = {
        ...cards,
        [from]: cards[from].filter((candidate) => candidate.id !== id),
    };
    const destination = [...next[to]];
    destination.splice(index, 0, card);
    next[to] = destination;
    return next;
}
