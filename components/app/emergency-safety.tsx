import { SAFETY } from '../../lib/emergency';
import { DEFAULT_LANGUAGE, languageQuality } from '../../lib/languages';
/** The page translator handles the first line. Keep the English copy visible for Early languages. */
export function EmergencySafety({line,language}:{line:string;language?:string|null}) {
 return <><p role="alert">{line}</p>{languageQuality(language??DEFAULT_LANGUAGE)==='Early'&&<p data-no-translate lang="en">{line}</p>}</>;
}
export function emergencyPrefix(text:string) { return Object.values(SAFETY).find(line=>text.startsWith(line)); }
