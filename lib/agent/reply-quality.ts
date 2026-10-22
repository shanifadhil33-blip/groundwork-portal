import { rightScript } from '../i18n';
/** Reject provider refusals about missing context, rather than passing them off as a read result. */
export const NON_ANSWER=/rate limit|quota|internal error|something went wrong|request is incomplete|incomplete request|invalid tool arguments|input is lacking|(?:input|request|question) (?:lacks|is missing|does not contain)|necessary details|not identified in (?:the )?(?:provided|given) (?:output|context|data)|(?:insufficient|not enough) (?:information|context|details)|cannot (?:answer|determine) (?:from|without)|please (?:provide|supply) (?:more|additional) (?:details|context|information)|لا (?:توجد معلومات كافية|يمكنني تحديد)|معلومات غير كافية|जानकारी पर्याप्त नहीं|معلومات ناکافی/i;
const scripts:Record<string,RegExp>={ar:/\p{Script=Arabic}/u,ur:/\p{Script=Arabic}/u,ps:/\p{Script=Arabic}/u,fa:/\p{Script=Arabic}/u,hi:/\p{Script=Devanagari}/u,ne:/\p{Script=Devanagari}/u,bn:/\p{Script=Bengali}/u,ml:/\p{Script=Malayalam}/u,ta:/\p{Script=Tamil}/u,am:/\p{Script=Ethiopic}/u,ti:/\p{Script=Ethiopic}/u,zh:/\p{Script=Han}/u};
const nativeWords:Record<string,RegExp>={fil:/\b(?:ang|mga|ng|na|sa|may|walang|ay|pinaka)\b/iu,sw:/\b(?:ya|wa|kazi|ni|kwa|na|hakuna|ina)\b/iu,so:/\b(?:waa|iyo|shaqo|shaqooyinka|ugu|ayaa|maanta)\b/iu,yo:/\b(?:ni|ati|iṣẹ|awọn|sí|ṣe|ko)\b/iu,ha:/\b(?:aiki|ayyuka|da|na|yana|babu|mafi)\b/iu,ig:/\b(?:ọrụ|na|bụ|nke|enweghị|kacha)\b/iu,lg:/\b(?:emirimu|ne|ku|ya|ye|mu|tewali)\b/iu,tw:/\b(?:nnwuma|adwuma|ne|no|yɛ|ɛyɛ|wɔ)\b/iu};
export function usableReply(text:string,language?:string|null):boolean {
 if(NON_ANSWER.test(text))return false;
 if(!language)return true;
 const base=language.split('-')[0];
 if(!rightScript(text,language))return false;
 const prose=text.replace(/\[[^\]]*\]\([^)]*\)|https?:\/\/\S+|\b(?:WO\s*\d+|Agent|Groundwork)\b/gu,'');
 const letters=prose.match(/\p{L}/gu)??[];
 const script=scripts[base];
 if(script&&letters.length)return letters.filter(ch=>script.test(ch)).length/letters.length>=0.25;
 if(base==='en')return !letters.length||letters.filter(ch=>/\p{Script=Latin}/u.test(ch)).length/letters.length>=0.75;
 // For languages sharing Latin script, reject clear English prose without native function words.
 if(nativeWords[base]&&!nativeWords[base].test(prose)){
  const english=prose.match(/\b(?:the|this|that|is|are|has|have|with|your|you|jobs|open|technician|most|not|provided|please|there)\b/gi)??[];
  if(english.length>=2)return false;
 }
 return true;
}
