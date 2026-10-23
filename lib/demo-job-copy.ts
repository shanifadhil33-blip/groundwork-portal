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
export const DEMO_JOB_DESCRIPTION_TEMPLATE = 'Routine facilities request {number}; coordinate access with the site manager.';
export const demoJobDescription = (number: number) => DEMO_JOB_DESCRIPTION_TEMPLATE.replace('{number}', String(number));
/** Static files contain the template, never numbered job data. Expand only exact seeded instances. */
export function demoJobTranslations(words: Record<string, string>): Record<string, string> {
 const template=words[DEMO_JOB_DESCRIPTION_TEMPLATE];
 return template?Object.fromEntries(Array.from({length:66},(_,index)=>[demoJobDescription(index+1),template.replace('{number}',String(index+1))])):{};
}
export const DEMO_JOB_COMMENTS = {
  client: 'We have received your request and confirmed access with the site manager.',
  internal: 'Check stock and technician availability before the next visit.',
} as const;
