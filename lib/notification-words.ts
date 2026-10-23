// Server reads use the same files that Translator loads in the browser.
import words0 from '../public/i18n/ar-AE.json';
import words1 from '../public/i18n/hi.json';
import words2 from '../public/i18n/ur.json';
import words3 from '../public/i18n/bn.json';
import words4 from '../public/i18n/ml.json';
import words5 from '../public/i18n/ta.json';
import words6 from '../public/i18n/ne.json';
import words7 from '../public/i18n/ps.json';
import words8 from '../public/i18n/fa-AF.json';
import words9 from '../public/i18n/fa-IR.json';
import words10 from '../public/i18n/fil.json';
import words11 from '../public/i18n/zh-CN.json';
import words12 from '../public/i18n/sw-KE.json';
import words13 from '../public/i18n/am.json';
import words14 from '../public/i18n/ti.json';
import words15 from '../public/i18n/so.json';
import words16 from '../public/i18n/yo.json';
import words17 from '../public/i18n/ha.json';
import words18 from '../public/i18n/ig.json';
import words19 from '../public/i18n/lg.json';
import words20 from '../public/i18n/tw.json';
import { LANGUAGES } from './languages';
const sourceFiles: Record<string,Record<string,string|null>> = {'ar-AE':words0,'hi':words1,'ur':words2,'bn':words3,'ml':words4,'ta':words5,'ne':words6,'ps':words7,'fa-AF':words8,'fa-IR':words9,'fil':words10,'zh-CN':words11,'sw-KE':words12,'am':words13,'ti':words14,'so':words15,'yo':words16,'ha':words17,'ig':words18,'lg':words19,'tw':words20};
// Pending source keys are not translations; callers receive only saved strings.
const files: Record<string,Record<string,string>> = Object.fromEntries(Object.entries(sourceFiles).map(([code, words]) =>
 [code, Object.fromEntries(Object.entries(words).filter((entry): entry is [string,string] => typeof entry[1] === 'string'))]));
export function notificationLanguage(language?:string|null) {
 const code=(language??'en-IN').toLowerCase().replace('_','-');
 const aliases:Record<string,string>={tl:'fil',fa:'fa-IR'};
 if(aliases[code])return aliases[code];
 return LANGUAGES.find(l=>l.code.toLowerCase()===code)?.code ?? LANGUAGES.find(l=>l.code.split('-')[0].toLowerCase()===code.split('-')[0])?.code ?? 'en-IN';
}
export const notificationWords = (language?:string|null):Record<string,string> => files[notificationLanguage(language)]??{};
