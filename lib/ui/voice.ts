import { DEFAULT_LANGUAGE } from '../languages';
const locales:Record<string,string>={ar:'ar-AE',ne:'ne-NP',ur:'ur-PK',hi:'hi-IN',bn:'bn-BD',fa:'fa-IR',ps:'ps-AF',prs:'fa-AF',zh:'zh-CN',en:'en-US',ml:'ml-IN',ta:'ta-IN',fil:'fil-PH',am:'am-ET',ti:'ti-ER',so:'so-SO',yo:'yo-NG',ha:'ha-NG',ig:'ig-NG',lg:'lg-UG',tw:'tw-GH'};
export function speechLanguage(language:string|null|undefined){const code=language||DEFAULT_LANGUAGE;return locales[code]??code;}
export const MICROPHONE_BLOCKED='Microphone is blocked. Allow it in your browser settings to talk to your agent.';
export const VOICE_UNSUPPORTED='Voice input is unavailable in this browser. You can type your message.';
