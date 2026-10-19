import { expect, it } from 'vitest';
import { detectReplyLength, replyLengthNotice, replyLengthPrompt, replyLengthUndo, type ReplyLength } from '../lib/agent/replylength';

const examples = [
 ['English',['shorter','keep it short','too long','make your replies shorter'],['normal length','use normal length'],['more detail','explain more','give more detail']],
 ['Arabic',['اختصر','خلي الرد قصير','الرد طويل'],['رد بطول عادي'],['تفاصيل أكثر','اشرح أكثر']],
 ['Hindi',['छोटा जवाब दो','संक्षेप में बताओ','बहुत लंबा है'],['सामान्य लंबाई'],['और विस्तार से बताओ','और समझाओ']],
 ['Urdu',['مختصر جواب دو','مختصر بتاؤ','بہت لمبا ہے'],['معمول کی لمبائی'],['مزید تفصیل دو','مزید سمجھاؤ']],
 ['Malayalam',['ചുരുക്കി പറയൂ','വളരെ നീളമാണ്'],['സാധാരണ നീളത്തിൽ പറയൂ'],['കൂടുതൽ വിശദമായി പറയൂ']],
 ['Tamil',['சுருக்கமாக சொல்லுங்கள்','மிக நீளமாக உள்ளது'],['வழக்கமான நீளத்தில் சொல்லுங்கள்'],['மேலும் விவரமாக சொல்லுங்கள்','மேலும் விளக்குங்கள்']],
 ['Filipino',['paikliin','maikli lang','masyadong mahaba'],['karaniwang haba'],['mas detalyado','ipaliwanag pa']]
] as const;
for(const [language,short,normal,detailed] of examples)it(`detects each reply length in ${language}`,()=>{
 for(const [phrases,value] of [[short,'short'],[normal,'normal'],[detailed,'detailed']] as const)
  for(const phrase of phrases)expect(detectReplyLength(phrase)).toBe(value);
});
it('normalizes polite requests, case and punctuation without reading instructions inside other text',()=>{
 expect(detectReplyLength(' Please KEEP IT SHORT! ')).toBe('short');
 expect(detectReplyLength('explain more please.')).toBe('detailed');
 for(const text of ['','make the job shorter','Ravi said keep it short','"shorter"','Do not keep it short','set Omar to more detail','shorter and assign the job','the cable is too long'])expect(detectReplyLength(text)).toBeNull();
});
it('provides one prompt line per value and always protects cards, safety and refusals',()=>{
 expect(replyLengthPrompt('short')).toContain('at most two short sentences unless he asks for a list');
 expect(replyLengthPrompt('detailed')).toContain('up to six sentences and include the reason');
 expect(replyLengthPrompt()).toBe(replyLengthPrompt('normal'));
 expect(replyLengthPrompt('normal')).toContain('usual reply length');
 for(const length of ['short','normal','detailed'] as const){expect(replyLengthPrompt(length)).toContain('Never shorten cards, safety lines or refusals');expect(replyLengthPrompt(length).split('\n')).toHaveLength(1);}
});
it('allows Undo only for the immediately preceding receipt at the current value',()=>{
 const receipt=replyLengthNotice('short','detailed');
 const messages=[{role:'assistant',content:receipt},{role:'user',content:'Undo'}];
 expect(replyLengthUndo(messages,'short')).toBe('detailed');
 expect(replyLengthUndo(messages,'normal')).toBeNull();
 expect(replyLengthUndo([{role:'user',content:receipt},messages[1]],'short')).toBeNull();
 expect(replyLengthUndo([...messages,{role:'assistant',content:'Done.'},{role:'user',content:'Undo'}],'short')).toBeNull();
 for(const previous of ['short','normal','detailed'] as ReplyLength[])expect(replyLengthUndo([{role:'assistant',content:replyLengthNotice('normal',previous)},messages[1]],'normal')).toBe(previous);
});
