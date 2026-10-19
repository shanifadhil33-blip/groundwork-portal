/** Generated fields are an allowlist: model prose is never allowed into either field.
 * The reporter's words remain verbatim, even when he himself names a possible cause. */
export function householdFields(words: string, where?: string, since?: string, _generated?: {title?: string; problem?: string}) {
 return { title: 'Home maintenance request', problem: [words, ...(where ? [`Where: ${where}`] : []), ...(since ? [`Since: ${since}`] : [])].join('\n') };
}
