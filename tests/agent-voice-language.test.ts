import { expect, it } from 'vitest';
import { speechLanguage } from '../lib/ui/voice';
import { LANGUAGES } from '../lib/languages';
it('maps app languages to speech locales',()=>{for(const [code,locale] of Object.entries({ar:'ar-AE',ne:'ne-NP',ur:'ur-PK',hi:'hi-IN',bn:'bn-BD',fa:'fa-IR',ps:'ps-AF',prs:'fa-AF',zh:'zh-CN',en:'en-US'}))expect(speechLanguage(code)).toBe(locale);});
it('keeps chosen regional languages and maps every supported app language',()=>{for(const l of LANGUAGES)expect(speechLanguage(l.code)).toMatch(/^[a-z]{2,3}-[A-Z]{2}$/);expect(speechLanguage('en-IN')).toBe('en-IN');expect(speechLanguage('fa-AF')).toBe('fa-AF');expect(speechLanguage(null)).toBe('en-IN');});
