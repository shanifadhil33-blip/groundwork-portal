import { LANGUAGES } from '../languages';

/** New exact source keys, with an English fallback in every supported language. */
const sources = ['Needs action', 'Today', 'Open requests', 'Nothing needs action now', 'View requests', 'Review job', 'Review parts', 'Assign job', 'Review price', 'We couldn’t load items that need action.', 'Start work', 'Complete job', 'Visits', 'No visit scheduled.', 'Notes', 'Costs', 'History', 'Back to dashboard'] as const;
export const designCopyFallbacks: Record<string, Record<string, string>> = Object.fromEntries(
  LANGUAGES.map(language => [language.code, Object.fromEntries(sources.map(source => [source, source]))]),
);
