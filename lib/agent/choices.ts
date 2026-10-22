import am from '../../public/i18n/am.json';
import ar_AE from '../../public/i18n/ar-AE.json';
import bn from '../../public/i18n/bn.json';
import fa_AF from '../../public/i18n/fa-AF.json';
import fa_IR from '../../public/i18n/fa-IR.json';
import fil from '../../public/i18n/fil.json';
import ha from '../../public/i18n/ha.json';
import hi from '../../public/i18n/hi.json';
import ig from '../../public/i18n/ig.json';
import lg from '../../public/i18n/lg.json';
import ml from '../../public/i18n/ml.json';
import ne from '../../public/i18n/ne.json';
import ps from '../../public/i18n/ps.json';
import so from '../../public/i18n/so.json';
import sw_KE from '../../public/i18n/sw-KE.json';
import ta from '../../public/i18n/ta.json';
import ti from '../../public/i18n/ti.json';
import tw from '../../public/i18n/tw.json';
import ur from '../../public/i18n/ur.json';
import yo from '../../public/i18n/yo.json';
import zh_CN from '../../public/i18n/zh-CN.json';
import { isEnglish, rightScript } from '../i18n';

const files:Record<string,Record<string,string>>={'am':am, 'ar-AE':ar_AE, 'bn':bn, 'fa-AF':fa_AF, 'fa-IR':fa_IR, 'fil':fil, 'ha':ha, 'hi':hi, 'ig':ig, 'lg':lg, 'ml':ml, 'ne':ne, 'ps':ps, 'so':so, 'sw-KE':sw_KE, 'ta':ta, 'ti':ti, 'tw':tw, 'ur':ur, 'yo':yo, 'zh-CN':zh_CN};
const FALLBACK='Which option do you mean?';
const questionScripts:Record<string,RegExp>={
 'ar-AE':/\p{Script=Arabic}/u, ur:/\p{Script=Arabic}/u, ps:/\p{Script=Arabic}/u, 'fa-AF':/\p{Script=Arabic}/u, 'fa-IR':/\p{Script=Arabic}/u,
 hi:/\p{Script=Devanagari}/u, ne:/\p{Script=Devanagari}/u, bn:/\p{Script=Bengali}/u, ml:/\p{Script=Malayalam}/u, ta:/\p{Script=Tamil}/u,
 am:/\p{Script=Ethiopic}/u, ti:/\p{Script=Ethiopic}/u, 'zh-CN':/\p{Script=Han}/u,
};

/** Use shipped tap labels without another AI call or translation request. */
export function choiceWords(language?:string|null) {
 const file=files[language??''];
 return (source:string)=>file?.[source]??source;
}
export function choicePrompt(language?:string|null) {
 const word=choiceWords(language);
 return `For ask_choice, write exactly one short question in the reply language, including the question field of the tool. For Yes and Change answers use these exact tap labels: ${JSON.stringify([word('Yes'),word('Change')])}. Keep job numbers and names unchanged. Other answers must also use the reply language.`;
}
export function localizedChoice(q:{question:string;options:string[]},language?:string|null) {
 const word=choiceWords(language);
 const localized=!!files[language??'']&&!isEnglish(language??'en-IN');
 let reply=word(q.question);
 // If the model ignores the language instruction, keep the choices and ask safely.
 if(localized&&(!rightScript(reply,language??undefined)||(questionScripts[language??'']&&!questionScripts[language??''].test(reply))||/^(?:what|which|where|when|who|how|shall|should|would|could|can|do|did|are|is|save)\b/i.test(reply)))reply=word(FALLBACK);
 return {reply,choices:q.options.map(word),...(localized?{localized:true}:{})};
}

/** Match only shipped error text; arbitrary server text is never trusted as visible copy. */
export function isLanguageFileWord(language: string | null | undefined, text: string) {
 return Object.values(files[language ?? ''] ?? {}).includes(text);
}
