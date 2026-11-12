import { demoRoundTwoTranslations } from './demo-round-two-copy';

// Exact case 3 / Ridgeline fixture text; never broaden this to arbitrary job data.
export const DEMO_JOB_TITLES = [
  'Replace lobby light fixture',
  'Service rooftop ventilation',
  'Repair entry door closer',
  'Inspect emergency lighting',
  'Seal loading bay threshold',
  'Replace washroom tap',
  'Adjust meeting room cooling',
  'Repair stairwell handrail',
  'Clear courtyard drainage',
  'Test access control reader',
  'Replace corridor ceiling tile',
  'Service water pump',
] as const;
/** Older sandboxes may still hold this numbered text; it stays translated. */
export const DEMO_JOB_DESCRIPTION_TEMPLATE = 'Routine facilities request {number}; coordinate access with the site manager.';
/** What the client wrote, one per job title, so each sample job reads like a real request. */
export const DEMO_JOB_DESCRIPTIONS: Record<string, string> = {
  "Replace lobby light fixture": "The main lobby light flickers and then goes out.",
  "Service rooftop ventilation": "The rooftop fan is noisy and the air upstairs feels stale.",
  "Repair entry door closer": "The front door slams shut instead of closing slowly.",
  "Inspect emergency lighting": "Two exit signs stay dark when the power is cut.",
  "Seal loading bay threshold": "Rain comes in under the loading bay door.",
  "Replace washroom tap": "The washroom tap will not turn off fully.",
  "Adjust meeting room cooling": "The meeting room is too cold in the morning and warm after lunch.",
  "Repair stairwell handrail": "The handrail on the second floor stairs is loose.",
  "Clear courtyard drainage": "Water stays in the courtyard after cleaning.",
  "Test access control reader": "The card reader at the side door does not always open it.",
  "Replace corridor ceiling tile": "A ceiling tile in the corridor is stained and sagging.",
  "Service water pump": "The water pump runs all night and the pressure is low.",
  'Fix the leaking pantry tap': 'The pantry tap drips all day.',
};
export const demoJobDescription = (number: number) => DEMO_JOB_DESCRIPTIONS[DEMO_JOB_TITLES[(number - 1) % DEMO_JOB_TITLES.length]];
/** Static files contain the template, never numbered job data. Expand only exact seeded instances. */
export function demoJobTranslations(words: Record<string, string>): Record<string, string> {
 const template=words[DEMO_JOB_DESCRIPTION_TEMPLATE];
 return {...demoRoundTwoTranslations(words), ...(template?Object.fromEntries(Array.from({length:66},(_,index)=>[demoJobDescription(index+1),template.replace('{number}',String(index+1))])):{})};
}
export const DEMO_JOB_COMMENTS = {
  client: 'We have received your request and confirmed access with the site manager.',
  internal: 'Check stock and technician availability before the next visit.',
} as const;
