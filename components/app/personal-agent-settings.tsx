'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LANGUAGES, DEFAULT_LANGUAGE } from '../../lib/languages';
import { request, RequestError } from '../../lib/ui/api';
import { Button, Dropdown, ErrorState } from '../ui';
import { useApp } from './context';
import { useResource } from './resource';
import { changeAppLanguage } from './translator';
import { AgentLog } from './dashboard';
export type AgentPreferences={agent_name:string|null;voice_enabled:boolean;language:string|null};
export function PersonalAgentSettings(){
 const {member}=useApp(),prefs=useResource<AgentPreferences>('/api/me/preferences');
 const base=member?`/api/workspaces/${member.workspace_id}`:null;
 const settings=useResource<{approval_mode:'important'|'every'}>(base?`${base}/settings`:null);
 const [name,setName]=useState(''),[language,setLanguage]=useState(DEFAULT_LANGUAGE),[voice,setVoice]=useState(true),[mode,setMode]=useState('important'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const admin=member?.role==='admin';
 useEffect(()=>{if(prefs.data){setName(prefs.data.agent_name??'');setLanguage(prefs.data.language??DEFAULT_LANGUAGE);setVoice(prefs.data.voice_enabled);}},[prefs.data]);
 useEffect(()=>{if(settings.data)setMode(settings.data.approval_mode);},[settings.data]);
 async function save(){setBusy(true);setError('');setNotice('');try{
  await request('/api/me/preferences',{method:'PATCH',body:JSON.stringify({agent_name:name,language,voice_enabled:voice})});
  changeAppLanguage(language);window.dispatchEvent(new Event('groundwork-retry-resources'));
  if(admin&&base&&mode!==settings.data?.approval_mode)await request(`${base}/settings`,{method:'PATCH',body:JSON.stringify({approval_mode:mode})});
  setNotice('Agent settings saved.');
 }catch(e){setError(e instanceof RequestError?e.message:'We could not save your settings. Please try again.');}finally{setBusy(false);}}
 return <div className="page stack agent-settings"><Link href="/settings">Back to settings</Link><h1>Agent</h1>{prefs.loading?<p>Loading settings…</p>:prefs.error?<ErrorState retry={prefs.reload}/>:<form className="stack" onSubmit={e=>{e.preventDefault();void save();}}>
 <label className="form-field">Name<input value={name} maxLength={40} placeholder="Agent" disabled={busy} onChange={e=>setName(e.target.value)}/></label><p>Leave the name empty to use Agent.</p>
 <div className="form-field"><label htmlFor="agent-language">Language</label><Dropdown id="agent-language" label="Language" value={language} disabled={busy} options={LANGUAGES.map(l=>({value:l.code,noTranslate:true,label:l.native===l.name?l.name:`${l.name}, ${l.native}`}))} onChange={setLanguage}/></div>
 <label className="choice-row"><input type="checkbox" role="switch" checked={voice} disabled={busy} onChange={e=>setVoice(e.target.checked)}/>Voice {voice?'on':'off'}</label>
 {member&&<div className="form-field"><label htmlFor="agent-approval">Approval mode</label>{settings.loading?<p>Loading…</p>:settings.error?<ErrorState retry={settings.reload}/>:admin?<Dropdown id="agent-approval" label="Approval mode" value={mode} disabled={busy} options={[{value:'important',label:'Ask before important actions'},{value:'every',label:'Ask before every action'}]} onChange={setMode}/>:<p>{mode==='every'?'Ask before every action':'Ask before important actions'}</p>}</div>}
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<Button type="submit" busy={busy} disabled={!!member&&(settings.loading||!!settings.error)}>Save</Button>
 </form>}<Link href="/settings/agent/log">What I've learned</Link></div>;
}
export function PersonalAgentLog(){const {member}=useApp();return <div className="page stack agent-settings"><Link href="/settings/agent">Back to Agent</Link><h1>What I've learned</h1>{member&&<AgentLog base={`/api/workspaces/${member.workspace_id}`}/>}</div>;}
