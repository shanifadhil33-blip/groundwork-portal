/** The whole join is a message so punctuation and spacing belong to the locale. */
export const NAME_JOIN = '{first}, {second}';
export function joinNames(values: (string | null | undefined)[], words: Record<string, string> = {}): string {
  return values.filter((value): value is string => !!value).reduce((first, second) => first ?
    (words[NAME_JOIN] ?? NAME_JOIN).replace(/\{(first|second)\}/g, (_, key) => key === 'first' ? first : second) : second, '');
}
