/** LEARN02: every agent reply uses a warm, friendly, plain voice. Cards, safety lines and refusals stay exact. */
export const WARM_TONE = 'Write every reply in a warm, friendly and plain voice. Use short sentences. Use his first name only now and then. Never sound like a system notice.';

const PROTECTED = /^(?:Safety first|Only |You can |Ask |That |This |No changes|I could not|I can’t|I can't)/;

export function warmLead(name: string | null | undefined, text: string) {
  const first = name?.trim().split(/\s+/)[0];
  if (!first || PROTECTED.test(text) || text.includes(first)) return text;
  return `${first}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}
