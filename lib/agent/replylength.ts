export const REPLY_LENGTHS = ['short', 'normal', 'detailed'] as const;
export type ReplyLength = typeof REPLY_LENGTHS[number];
export const replyLengthLabels: Record<ReplyLength, string> = {short:'Short',normal:'Normal',detailed:'Detailed'};

// Whole utterances only: a job description or a quoted instruction is not a preference.
const phrases: Record<ReplyLength, readonly string[]> = {
 short: ['shorter','keep it short','too long','make your replies shorter',
  'اختصر','خلي الرد قصير','الرد طويل',
  'छोटा जवाब दो','संक्षेप में बताओ','बहुत लंबा है',
  'مختصر جواب دو','مختصر بتاؤ','بہت لمبا ہے',
  'ചുരുക്കി പറയൂ','വളരെ നീളമാണ്',
  'சுருக்கமாக சொல்லுங்கள்','மிக நீளமாக உள்ளது',
  'paikliin','maikli lang','masyadong mahaba'],
 normal: ['normal length','use normal length',
  'رد بطول عادي','सामान्य लंबाई','معمول کی لمبائی',
  'സാധാരണ നീളത്തിൽ പറയൂ','வழக்கமான நீளத்தில் சொல்லுங்கள்','karaniwang haba'],
 detailed: ['more detail','explain more','give more detail',
  'تفاصيل أكثر','اشرح أكثر','और विस्तार से बताओ','और समझाओ',
  'مزید تفصیل دو','مزید سمجھاؤ','കൂടുതൽ വിശദമായി പറയൂ',
  'மேலும் விவரமாக சொல்லுங்கள்','மேலும் விளக்குங்கள்','mas detalyado','ipaliwanag pa']
};
export function detectReplyLength(text: string): ReplyLength | null {
 const words=text.normalize('NFC').trim().toLowerCase().replace(/[.!?؟۔।！]+$/u,'').trim()
  .replace(/^(?:please\s+|कृपया\s+|براہ کرم\s+|من فضلك\s+)/u,'').replace(/\s+please$/u,'').replace(/\s+/gu,' ');
 return REPLY_LENGTHS.find(value=>phrases[value].includes(words))??null;
}
export function replyLengthPrompt(value: ReplyLength = 'normal'): string {
 const length=value==='short'?'Use at most two short sentences unless he asks for a list.':value==='detailed'?'Use up to six sentences and include the reason.':'Use the usual reply length.';
 return `Reply length: ${length} Never shorten cards, safety lines or refusals because of this preference.`;
}
export function replyLengthNotice(value: ReplyLength, previous: ReplyLength): string {
 return `Reply length set to ${replyLengthLabels[value]} (was ${replyLengthLabels[previous]}).`;
}
// The existing quick answers send their label back with the conversation.
// Only the immediately preceding setting receipt can supply an Undo target.
export function replyLengthUndo(messages: {role:string;content:string}[], current: ReplyLength): ReplyLength | null {
 if(messages.at(-1)?.role!=='user'||messages.at(-1)?.content.trim()!=='Undo')return null;
 const receipt=messages.at(-2);
 if(receipt?.role!=='assistant')return null;
 return REPLY_LENGTHS.find(previous=>receipt.content===replyLengthNotice(current,previous))??null;
}
