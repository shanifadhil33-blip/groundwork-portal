import { DEMO_JOB_TITLES } from '../demo-job-copy';
import { choiceWords } from './choices';
import { inWorkspace } from '../services/shared';

const known = new Set<string>(DEMO_JOB_TITLES);
/**
 * The dashboard shows the sample jobs' titles from the shipped language files (see Translator and demoJobTranslations).
 * Quick answers use the same files and the same exact titles, and only in the demo workspace. Real job titles are
 * never changed, and a title with no shipped translation stays as written.
 */
export function localizedJobTitle(title: unknown, language: string | null | undefined, demo: boolean): string {
  const text = String(title ?? '');
  if (!demo || !language || language.startsWith('en') || !known.has(text)) return text;
  return choiceWords(language)(text);
}
export const isDemoWorkspace = (user: string, ws: string) =>
  inWorkspace(user, ws, async x => !!(await x.db.query('SELECT is_demo FROM workspaces WHERE id=$1', [ws])).rows[0]?.is_demo);
