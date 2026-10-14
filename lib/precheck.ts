// CMP03: the short ready check a client answers before the visit. Plain words, yes or no.
export const PRECHECK = [
  { key: 'home', label: 'Someone will be there to open the door' },
  { key: 'access', label: 'Parking or an access pass is arranged' },
  { key: 'clear', label: 'The work area is clear' },
  { key: 'power', label: 'Power and water can be switched off if needed' },
  { key: 'pets', label: 'Pets will be kept in another room' },
] as const;
export type PrecheckKey = (typeof PRECHECK)[number]['key'];
/** Ready when every item is a yes. Items not answered count as not ready. */
export function precheckState(answers: Record<string, boolean> | null | undefined) {
  if (!answers) return { ready: false, missing: PRECHECK.map(p => p.label), answered: false };
  const missing = PRECHECK.filter(p => answers[p.key] !== true).map(p => p.label);
  return { ready: missing.length === 0, missing, answered: true };
}
