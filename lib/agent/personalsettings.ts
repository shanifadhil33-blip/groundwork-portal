import { detectReplyLength, replyLengthLabels } from './replylength';
import { LANGUAGES } from '../languages';
export const PERSONAL_SETTINGS = ['theme','language','voice_enabled','reply_length','agent_name','preferred_name','email_notifications'] as const;
export type PersonalSetting = typeof PERSONAL_SETTINGS[number];
export type SettingValue = string | boolean | null;
export type SettingChange = {setting:PersonalSetting;value:SettingValue};
const labels:Record<PersonalSetting,string> = {theme:'Theme',language:'Language',voice_enabled:'Voice',reply_length:'Reply length',agent_name:'Agent name',preferred_name:'Preferred name',email_notifications:'Email notifications'};
export function settingLabel(setting:PersonalSetting,value:SettingValue):string {
 if(value==null)return 'Default';
 if(typeof value==='boolean')return value?'On':'Off';
 if(setting==='agent_name'||setting==='preferred_name')return JSON.stringify(value);
 if(setting==='language')return LANGUAGES.find(l=>l.code===value)?.name??value;
 if(setting==='reply_length')return replyLengthLabels[value as keyof typeof replyLengthLabels];
 return value.charAt(0).toUpperCase()+value.slice(1);
}
export function settingNotice(setting:PersonalSetting,value:SettingValue,previous:SettingValue){return `${labels[setting]} set to ${settingLabel(setting,value)} (was ${settingLabel(setting,previous)}).`;}
export function settingRestored(setting:PersonalSetting,value:SettingValue){return `${labels[setting]} restored to ${settingLabel(setting,value)}.`;}
export function settingRefusal(setting?:string){
 if(setting?.includes('phone'))return 'Tell me the new number. I will send a code before anything is saved.';
 if(setting?.includes('address'))return 'I can not change an address this way. Open Profile, or ask the office to update it.';
 if(setting?.includes('role')||setting?.includes('company'))return 'Ask an admin to change roles or company settings.';
 return 'I can change only your own personal settings. Open Profile or ask an admin for other changes.';
}
export function detectPersonalSetting(text:string):SettingChange|null {
 const length=detectReplyLength(text);if(length)return {setting:'reply_length',value:length};
 const words=text.trim().toLowerCase().replace(/[.!?]+$/u,'').trim().replace(/^please\s+|\s+please$/gu,'').replace(/\s+/gu,' ');
 const phrases:Record<string,SettingChange>={
  'turn on dark theme':{setting:'theme',value:'dark'},'dark mode':{setting:'theme',value:'dark'},
  'light mode':{setting:'theme',value:'light'},'use system theme':{setting:'theme',value:'system'},
  'turn off voice':{setting:'voice_enabled',value:false},'turn on voice':{setting:'voice_enabled',value:true}
 };
 return Object.hasOwn(phrases,words)?phrases[words]:null;
}
export function settingUndo(messages:{role:string;content:string}[],current:Record<string,unknown>):SettingChange|null {
 if(messages.at(-1)?.role!=='user'||messages.at(-1)?.content.trim()!=='Undo'||messages.at(-2)?.role!=='assistant')return null;
 const receipt=messages.at(-2)!.content;
 for(const setting of PERSONAL_SETTINGS){
  const prefix=`${labels[setting]} set to ${settingLabel(setting,current[setting] as SettingValue)} (was `;
  if(!receipt.startsWith(prefix)||!receipt.endsWith(').'))continue;
  const label=receipt.slice(prefix.length,receipt.length-2);
  let value:SettingValue;
  if(label==='Default')value=null;
  else if(setting==='agent_name'||setting==='preferred_name'){try{value=JSON.parse(label);if(typeof value!=='string')continue;}catch{continue;}}
  else if(setting==='language'){const language=LANGUAGES.find(l=>l.name===label);if(!language)continue;value=language.code;}
  else if(setting==='voice_enabled'||setting==='email_notifications'){if(!['On','Off'].includes(label))continue;value=label==='On';}
  else value=label.toLowerCase();
  if(settingNotice(setting,current[setting] as SettingValue,value)===receipt)return {setting,value};
 }
 return null;
}
export function isSettingReceipt(text:string){return PERSONAL_SETTINGS.some(setting=>text.startsWith(`${labels[setting]} set to `));}
