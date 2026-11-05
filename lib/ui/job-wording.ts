/** Old saved replies and notifications can still contain the retired job prefix. */
export function plainJobWording(text: string, language?: string): string {
 // Infer direction per line so an Arabic job does not relabel English neighbours.
 if (!language && text.includes('\n')) return text.split('\n').map(line=>plainJobWording(line)).join('\n');
 const arabic = language?.toLowerCase().startsWith('ar') ?? /\p{Script=Arabic}/u.test(text);
 const label = arabic ? 'مهمة' : 'Job';
 if (arabic) text=text.replace(/\bJob\s*#\s*(\d+)/gi, 'مهمة #$1');
 return text.replace(/\bWO\s*[-\u2010-\u2014]?\s*#?\s*(\d+)/gi, `${label} #$1`)
  .replace(/\bWO\b/g, arabic ? 'مهمة' : 'job');
}
