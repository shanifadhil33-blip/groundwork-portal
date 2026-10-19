/** Words he tapped from the choices are app words and get translated; anything he typed stays as he wrote it. */
export const HOUSEHOLD_WHERE_CHOICES = ['Kitchen', 'Bathroom', 'Bedroom', 'Living room', 'Somewhere else'];
export const HOUSEHOLD_SINCE_CHOICES = ['Today', 'A few days', 'Longer'];
export const isHouseholdChoice = (v: string) => [...HOUSEHOLD_WHERE_CHOICES, ...HOUSEHOLD_SINCE_CHOICES].includes(v);
/** Generated fields are an allowlist: model prose is never allowed into either field.
 * The reporter's words remain verbatim, even when he himself names a possible cause. */
export function householdFields(words: string, where?: string, since?: string, _generated?: {title?: string; problem?: string}) {
 return { title: 'Home maintenance request', problem: [words, ...(where ? [`Where: ${where}`] : []), ...(since ? [`Since: ${since}`] : [])].join('\n') };
}
