import { groupNotifications } from '../lib/ui/notifications';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { EmergencySafety, emergencyPrefix } from '../components/app/emergency-safety';
import { LANGUAGES, languageQuality } from '../lib/languages';
import { SAFETY } from '../lib/emergency';
it.each(LANGUAGES.filter(l=>languageQuality(l.code)==='Early'))('Early language $code shows a safety line followed by preserved English',language=>{
 const html=renderToStaticMarkup(<EmergencySafety line={SAFETY.people} language={language.code}/>);
 expect(html).toContain('<p role="alert">');
 expect(html).toContain('<p data-no-translate="true" lang="en">');
 expect(html.split(SAFETY.people)).toHaveLength(3);
});
it('English shows one safety line and all kinds retain their prefix',()=>{
 expect(renderToStaticMarkup(<EmergencySafety line={SAFETY.gas} language="en"/>).split(SAFETY.gas)).toHaveLength(2);
 for(const line of Object.values(SAFETY))expect(emergencyPrefix(`${line}\n\nYour urgent request was sent.`)).toBe(line);
 expect(emergencyPrefix('Routine request')).toBeUndefined();
});

it('emergency alerts remain visible beside ordinary updates for the same job',()=>{
 const target={entity:'work_orders',id:'job'};
 const rows=groupNotifications([{id:'ordinary',kind:'status_changed',read_at:null,link_target:target},{id:'alert',kind:'emergency',read_at:null,link_target:target},{id:'review',kind:'emergency_review',read_at:null,link_target:target}]);
 expect(rows).toHaveLength(3);
});
