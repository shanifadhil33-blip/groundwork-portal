import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LANGUAGES } from '../lib/languages';
import { isEnglish } from '../lib/i18n';
import { localizedChoice } from '../lib/agent/choices';

it.each(LANGUAGES.filter(l=>!isEnglish(l.code)).map(l=>l.code))('%s gets its question and labels from the language file',language=>{
 const file=JSON.parse(readFileSync(`public/i18n/${language}.json`,'utf8'));
 expect(localizedChoice({question:'Which option do you mean?',options:['Yes','Change']},language)).toEqual({reply:file['Which option do you mean?'],choices:[file.Yes,file.Change],localized:true});
});
it.each(['en-IN','en-US','en-GB',null,'unknown'])('preserves English behavior for %s',language=>{
 expect(localizedChoice({question:'Save this report?',options:['Yes','Change']},language)).toEqual({reply:'Save this report?',choices:['Yes','Change']});
});

it.each(['ar-AE','hi','ur'])('localizes the server job clarification in %s',language=>{
 const file=JSON.parse(readFileSync(`public/i18n/${language}.json`,'utf8'));
 expect(localizedChoice({question:'Which job do you mean?',options:['Give a job number','Change my note']},language)).toMatchObject({reply:file['Which option do you mean?'],choices:[file['Give a job number'],file['Change my note']]});
 expect(localizedChoice({question:'Please tell me what you mean?',options:[file.Yes,file.Change]},language)).toMatchObject({reply:file['Which option do you mean?'],choices:[file.Yes,file.Change]});
});
