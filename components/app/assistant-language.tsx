'use client';
import { isEnglish } from '../../lib/i18n';
import { isRtl } from '../../lib/languages';
import { useNotificationLanguage } from './notification-language';
import { Button } from '../ui/button';

/** Read the same static words as the page translator, without an English first frame. */
export function useAssistantWords(preferred?: string | null) {
 const published = useNotificationLanguage();
 const language = published.language || preferred;
 // A stale publication from the previous language must not expose English
 // while preferences and the translator settle on the new selection.
 const matching = !preferred || !published.language || preferred === published.language;
 const english = matching && !!language && isEnglish(language);
 const words = published.language === language ? published.words : null;
 return { language, text: (source: string) => !matching ? null : english ? source : words?.[source] ?? null };
}

export const STARTER_INTRO = 'Ask about your workspace. You confirm changes before they happen.';
export function AssistantSuggestions({prompts,language,busy,submit}:{prompts:string[];language?:string|null;busy:boolean;submit:(prompt:string)=>void}) {
 const {text} = useAssistantWords(language);
 const ready = [STARTER_INTRO,...prompts].every(source=>text(source));
 return <div className="assistant-suggestions assistant-starters" data-no-translate aria-busy={!ready}>
  <p className={!ready?'starter-placeholder':undefined}>{ready?text(STARTER_INTRO):null}</p>
  {prompts.map(prompt=><Button key={prompt} variant="secondary" className={!ready?'starter-placeholder':undefined} disabled={busy||!ready} title={ready?text(prompt)!:undefined} onClick={()=>submit(prompt)}>{ready?text(prompt):null}</Button>)}
 </div>;
}

export function ListeningBar({language,elapsed,cancel,stop}:{language:string;elapsed:number;cancel:()=>void;stop:()=>void}) {
 const {text,language:resolved} = useAssistantWords(language);
 return <div className="voice-recording" role="status" dir={isRtl(resolved)?'rtl':'ltr'} data-no-translate>
  <span className="recording-dot" aria-hidden="true"/>
  <span className="voice-recording-label">{text('Listening')}</span>
  <span className="voice-recording-time" dir="ltr">{Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')}</span>
  <Button type="button" variant="ghost" onClick={cancel}>{text('Cancel')}</Button>
  <Button type="button" variant="secondary" onClick={stop}>{text('Stop')}</Button>
 </div>;
}
