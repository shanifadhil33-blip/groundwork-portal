/** LEARN02: every agent reply uses a warm, friendly, plain voice. Cards, safety lines and refusals stay exact. */
export const WARM_TONE = 'Write every reply in a warm, friendly and plain voice. Use short sentences. Use his first name only now and then. Never sound like a system notice.';

const PROTECTED = /^(?:Safety first|Only |You can |Ask |That |This |No changes|I could not|I can’t|I can't)/;

export function warmLead(name: string | null | undefined, text: string) {
  const first = name?.trim().split(/\s+/)[0];
  if (!first || PROTECTED.test(text) || text.includes(first)) return text;
  // Sentence case after the name: lower the first word unless it is "I" (I, I'm, I'll), or an acronym (WO, AC).
  const word = text.split(/[\s,.!?]/)[0] ?? '';
  const keep = /^I(?:['’][a-z]+)?$/.test(word) || /^[A-Z0-9]{2,}$/.test(word);
  const rest = keep ? text : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  return `${first}, ${rest}`;
}
