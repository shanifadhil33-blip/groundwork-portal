import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({rows:new Map<string,Record<string,unknown>>(),turn:vi.fn(),role:'admin',queries:vi.fn()}));
vi.mock('../lib/ai',()=>({assistantTurn:state.turn}));
vi.mock('../lib/db',()=>({
 asAgent:(_actor:unknown,fn:()=>unknown)=>fn(),
 withUser:async(user:string,fn:(db:unknown)=>unknown)=>fn({query:async(sql:string,args:unknown[])=>{
  state.queries(sql,args);
  if(sql.startsWith('INSERT INTO user_preferences'))return {rows:[]};
  if(sql.startsWith('SELECT * FROM user_preferences'))return {rows:[{...state.rows.get(user)}]};
  if(sql.startsWith('UPDATE user_preferences')){
   const row=state.rows.get(user)!;
   const keys=Array.from(sql.matchAll(/(\w+)=\$(\d+)/g));
   for(const [,key,index] of keys)if(key!=='user_id')row[key]=args[Number(index)-1];
   return {rows:[{...row}]};
  }
  return {rows:[]};
 }}),withSystem:async(fn:(db:unknown)=>unknown)=>fn({query:async()=>({rows:[]})}),
 ownerPool:{query:async()=>({rows:[]})},appPool:{query:async()=>({rows:[]})}
}));
vi.mock('../lib/services/shared',async original=>({...await original<typeof import('../lib/services/shared')>(),inWorkspace:async(user:string,ws:string,fn:(c:unknown)=>unknown)=>fn({user,ws,role:state.role,client_kind:'manager',db:{query:async()=>({rows:[]})}})}));
vi.mock('../lib/services/emergencies',()=>({reportEmergency:async()=>null}));
vi.mock('../lib/services/client-visits',async original=>({...await original<typeof import('../lib/services/client-visits')>(),selectedVisitChoice:async()=>null}));
vi.mock('../lib/services/agent-learning',()=>({listAgentLearning:async()=>({data:[]}),savePersonalLearning:vi.fn(),deletePersonalLearning:vi.fn()}));
vi.mock('../lib/services/contact-names',()=>({listContactNames:async()=>[],saveContactName:vi.fn()}));
import { LANGUAGES } from '../lib/languages';
import { detectPersonalSetting, settingUndo, settingNotice, type SettingValue, type PersonalSetting } from '../lib/agent/personalsettings';
import { setMySetting } from '../lib/services/personalsettings';
import { assistant } from '../lib/services/assistant';
import { callTool, tools } from '../lib/agent/tools';
import { allowedTool } from '../lib/agent/role-tools';
const defaults={theme:'light',language:null,voice_enabled:true,reply_length:'normal',agent_name:null,preferred_name:null,email_notifications:true};
beforeEach(()=>{state.rows.clear();state.rows.set('Imran',{...defaults});state.rows.set('Omar',{...defaults});state.turn.mockReset();state.queries.mockClear();state.role='admin';});
const changes:[PersonalSetting,SettingValue][]=[['theme','dark'],['language',LANGUAGES[0].code],['voice_enabled',false],['reply_length','short'],['agent_name','Ahmed'],['preferred_name','Imran'],['email_notifications',false]];
for(const [setting,value] of changes)it(`saves ${setting} with a receipt and restores exactly the earlier value`,async()=>{
 const previous=state.rows.get('Imran')![setting] as SettingValue;
 const result=await setMySetting('Imran',{setting,value});
 expect(result).toMatchObject({reply:settingNotice(setting,value,previous),choices:['Undo'],setting_change:{setting,value}});
 const undo=settingUndo([{role:'assistant',content:result.reply},{role:'user',content:'Undo'}],state.rows.get('Imran')!);
 expect(undo).toEqual({setting,value:previous});
 await setMySetting('Imran',undo);
 expect(state.rows.get('Imran')![setting]).toBe(previous);
 expect(state.rows.get('Omar')).toEqual(defaults);
 expect(state.queries.mock.calls.every(([,args])=>args[0]==='Imran')).toBe(true);
});
it('keeps names containing receipt punctuation reversible and trims through the preferences validator',async()=>{
 state.rows.get('Imran')!.preferred_name='Omar (was Ahmed).';
 const result=await setMySetting('Imran',{setting:'preferred_name',value:'  Imran  '});
 expect(result.reply).toBe('Preferred name set to "Imran" (was "Omar (was Ahmed).").');
 expect(settingUndo([{role:'assistant',content:result.reply},{role:'user',content:'Undo'}],state.rows.get('Imran')!)).toEqual({setting:'preferred_name',value:'Omar (was Ahmed).'});
});
it('accepts every supported language and refuses unknown codes',async()=>{
 for(const language of LANGUAGES)expect((await setMySetting('Imran',{setting:'language',value:language.code})).choices).toEqual(['Undo']);
 expect((await setMySetting('Imran',{setting:'language',value:'unknown'})).choices).toEqual([]);
});
it('refuses invalid values and foreign targets before any storage access',async()=>{
 for(const input of [{setting:'theme',value:'blue'},{setting:'voice_enabled',value:'false'},{setting:'reply_length',value:'brief'},{setting:'agent_name',value:'x'.repeat(41)},{setting:'preferred_name',value:'<Omar>'},{setting:'email_notifications',value:1},{setting:'theme',value:null},{setting:'theme',value:'dark',user_id:'Omar'}]){
  const result=await setMySetting('Imran',input);expect(result.choices).toEqual([]);expect(result).not.toHaveProperty('setting_change');
 }
 expect(state.queries).not.toHaveBeenCalled();
});
it('points outside settings to their existing flows without storage access',async()=>{
 for(const [setting,place] of [['address','ask the office'],['phone','code check'],['roles','admin'],['company_settings','admin'],['timezone','Profile'],['user_id','personal settings']])expect((await setMySetting('Imran',{setting,value:'Omar'})).reply).toContain(place);
 expect(state.queries).not.toHaveBeenCalled();
});
it('allows every role to call the write tool immediately even with connected keys',async()=>{
 for(const role of ['admin','staff','office','technician','client','client:manager','client:office','client:household']){
  expect(allowedTool(role,'set_my_setting')).toBe(true);state.role=role;
  const result=await callTool({user:'Imran',ws:'Groundwork',scope:'write',kind:'agent'},'set_my_setting',{setting:'theme',value:'dark'});
  expect(result.isError).toBeUndefined();expect(result.structuredContent).toMatchObject({result:{choices:['Undo']}});
 }
 expect(tools.set_my_setting.write).toBe(true);
 const result=await callTool({user:'Imran',ws:'Groundwork',scope:'read',kind:'agent'},'set_my_setting',{setting:'theme',value:'light'});
 expect(result.isError).toBe(true);
});
for(const [phrase,setting,value] of [['turn on dark theme','theme','dark'],['dark mode','theme','dark'],['light mode','theme','light'],['use system theme','theme','system'],['turn off voice','voice_enabled',false],['turn on voice','voice_enabled',true],['shorter','reply_length','short']] as const)it(`handles ${phrase} without a model`,async()=>{
 const result=await assistant('Imran','Groundwork',{messages:[{role:'user',content:phrase}]});
 expect(result).toMatchObject({available:true,choices:['Undo'],setting_change:{setting,value}});expect(state.turn).not.toHaveBeenCalled();
 const undone=await assistant('Imran','Groundwork',{messages:[{role:'assistant',content:(result as {reply:string}).reply},{role:'user',content:'Undo'}]});
 expect(undone).toMatchObject({choices:[],setting_change:{setting,value:defaults[setting]}});expect(state.turn).not.toHaveBeenCalled();
});
it('sends a job description containing dark to the mocked model',async()=>{
 state.turn.mockResolvedValue({calls:[],text:'Please give the job number.'});
 const text='The corridor is dark and the light needs fixing';expect(detectPersonalSetting(text)).toBeNull();
 await assistant('Imran','Groundwork',{messages:[{role:'user',content:text}]});
 expect(state.turn).toHaveBeenCalledTimes(1);expect(state.rows.get('Imran')).toEqual(defaults);
});
it('runs a mocked model setting call without a card for a technician',async()=>{
 state.role='technician';state.turn.mockResolvedValue({calls:[{id:'one',name:'set_my_setting',args:{setting:'preferred_name',value:'Ahmed'}}]});
 const result=await assistant('Imran','Groundwork',{messages:[{role:'user',content:'Call me Ahmed'}]});
 expect(result).toMatchObject({reply:'Preferred name set to "Ahmed" (was Default).',choices:['Undo']});expect(result).not.toHaveProperty('pending_action');
});
it('returns the plain refusal from a mocked model call for an address',async()=>{
 state.turn.mockResolvedValue({calls:[{id:'one',name:'set_my_setting',args:{setting:'address',value:'Tower 3'}}]});
 const result=await assistant('Imran','Groundwork',{messages:[{role:'user',content:'Change my address'}]});
 expect(result).toMatchObject({reply:expect.stringContaining('ask the office'),choices:[]});expect(state.rows.get('Imran')).toEqual(defaults);
});
it('permits Undo only immediately after the receipt and if its current value still matches',()=>{
 const receipt=settingNotice('theme','dark','light'),messages=[{role:'assistant',content:receipt},{role:'user',content:'Undo'}];
 expect(settingUndo(messages,{...defaults,theme:'dark'})).toEqual({setting:'theme',value:'light'});
 expect(settingUndo(messages,defaults)).toBeNull();
 expect(settingUndo([{role:'user',content:receipt},messages[1]],{...defaults,theme:'dark'})).toBeNull();
 expect(settingUndo([...messages,{role:'assistant',content:'Done.'},messages[1]],{...defaults,theme:'dark'})).toBeNull();
});
