import { DEFAULT_LANGUAGE } from '../languages';
const locales:Record<string,string>={ar:'ar-AE',ne:'ne-NP',ur:'ur-PK',hi:'hi-IN',bn:'bn-BD',fa:'fa-IR',ps:'ps-AF',prs:'fa-AF',zh:'zh-CN',en:'en-US',ml:'ml-IN',ta:'ta-IN',fil:'fil-PH',am:'am-ET',ti:'ti-ER',so:'so-SO',yo:'yo-NG',ha:'ha-NG',ig:'ig-NG',lg:'lg-UG',tw:'tw-GH'};
export function speechLanguage(language:string|null|undefined){const code=language||DEFAULT_LANGUAGE;return locales[code]??code;}
export const MICROPHONE_BLOCKED='Microphone is blocked. Allow it in your browser settings to talk to your agent.';
export const VOICE_UNSUPPORTED='Voice input is unavailable in this browser. You can type your message.';

export const INPUT_MODE_KEY='gw-agent-input-mode';
export type InputMode='voice'|'text';
export function rememberedInputMode():InputMode {
 try{return localStorage.getItem(INPUT_MODE_KEY)==='voice'?'voice':'text';}catch{return 'text';}
}
export function rememberInputMode(mode:InputMode){try{localStorage.setItem(INPUT_MODE_KEY,mode);}catch{ /* Storage can be unavailable. */ }}

/** Accept reply content only. Card controls and quick answers never enter speech. */
export function speechText(reply:string):string {
 return reply
  .replace(/```[^\n]*\n?/g,'').replace(/~~~[^\n]*\n?/g,'')
  .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm,'')
  .replace(/!?\[([^\]]+)\]\((?:[^()\s]|\([^()]*\))*(?:\s+"[^"]*")?\)/g,'$1')
  .replace(/\[([^\]]+)\]\[[^\]]*\]/g,'$1')
  .replace(/<https?:\/\/[^>]+>/g,'').replace(/https?:\/\/\S+/g,'')
  .replace(/<[^>]*>/g,'')
  .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|(?:[-+*]|\d+[.)])\s+)/gm,'')
  .replace(/^\s*(?:[-*_]\s*){3,}$/gm,'')
  .replace(/[*_`~]/g,'').replace(/\s+/g,' ').trim();
}
export function pickSpeechVoice<T extends {lang:string}>(voices:readonly T[],locale:string):T|undefined {
 const target=locale.toLowerCase(),base=target.split('-')[0];
 return voices.find(v=>v.lang.toLowerCase()===target)??voices.find(v=>v.lang.toLowerCase().split('-')[0]===base);
}

export type DictatedRange={start:number;end:number};
/** Preserve provenance outside the changed span of a draft. */
export function editDictatedRanges(before:string,after:string,ranges:DictatedRange[]):DictatedRange[] {
 let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
 let end=before.length,nextEnd=after.length;while(end>start&&nextEnd>start&&before[end-1]===after[nextEnd-1]){end--;nextEnd--;}
 const shift=nextEnd-end;
 return ranges.flatMap(r=>[
  ...(r.start<start?[{start:r.start,end:Math.min(r.end,start)}]:[]),
  ...(r.end>end?[{start:Math.max(r.start,end)+shift,end:r.end+shift}]:[])
 ]).filter(r=>after.slice(r.start,r.end).trim().length>0);
}
