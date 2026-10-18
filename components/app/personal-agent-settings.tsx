'use client';
import { AVATARS, AVATAR_LABELS } from '../../lib/avatars';
import { AgentAvatar } from './agent-avatar';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LANGUAGES, DEFAULT_LANGUAGE, languageOptions as langOpts } from '../../lib/languages';
import { request, RequestError } from '../../lib/ui/api';
import { Button, Dropdown, ErrorState } from '../ui';
import { useApp } from './context';
import { useResource } from './resource';
import { changeAppLanguage } from './translator';
import { AgentLog } from './dashboard';
export type AgentPreferences={agent_avatar?:string|null;agent_name:string|null;voice_enabled:boolean;language:string|null};
export function PersonalAgentSettings(){
 const {member}=useApp(),prefs=useResource<AgentPreferences>('/api/me/preferences');
 const base=member?`/api/workspaces/${member.workspace_id}`:null;
 const settings=useResource<{approval_mode:'important'|'every'}>(base?`${base}/settings`:null);
 const [name,setName]=useState(''),[avatar,setAvatar]=useState<string>('bot'),[language,setLanguage]=useState(DEFAULT_LANGUAGE),[voice,setVoice]=useState(true),[mode,setMode]=useState('important'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const admin=member?.role==='admin';
 useEffect(()=>{if(prefs.data){setName(prefs.data.agent_name??'');setAvatar(prefs.data.agent_avatar??'bot');setLanguage(prefs.data.language??DEFAULT_LANGUAGE);setVoice(prefs.data.voice_enabled);}},[prefs.data]);
 useEffect(()=>{if(settings.data)setMode(settings.data.approval_mode);},[settings.data]);
 async function save(){setBusy(true);setError('');setNotice('');try{
  await request('/api/me/preferences',{method:'PATCH',body:JSON.stringify({agent_name:name,agent_avatar:avatar,language,voice_enabled:voice})});
  changeAppLanguage(language);window.dispatchEvent(new Event('groundwork-retry-resources'));
  if(admin&&base&&mode!==settings.data?.approval_mode)await request(`${base}/settings`,{method:'PATCH',body:JSON.stringify({approval_mode:mode})});
  setNotice('Agent settings saved.');
 }catch(e){setError(e instanceof RequestError?e.message:'We could not save your settings. Please try again.');}finally{setBusy(false);}}
 return <div className="page stack agent-settings"><Link href="/settings">Back to settings</Link><h1>Agent</h1>{prefs.loading?<p>Loading settings…</p>:prefs.error?<ErrorState retry={prefs.reload}/>:<form className="stack" onSubmit={e=>{e.preventDefault();void save();}}>
 <label className="form-field">Name<input value={name} maxLength={40} placeholder="Agent" disabled={busy} onChange={e=>setName(e.target.value)}/></label><p>Leave the name empty to use Agent.</p>
 <fieldset className="avatar-pick"><legend>Picture</legend><div className="avatar-grid" role="radiogroup" aria-label="Picture">{AVATARS.map(a=><button key={a} type="button" role="radio" aria-checked={avatar===a} aria-label={AVATAR_LABELS[a]} className={avatar===a?'on':''} disabled={busy} onClick={()=>setAvatar(a)}><AgentAvatar avatar={a} size={24}/></button>)}</div></fieldset>
 <div className="form-field"><label htmlFor="agent-language">Language</label><Dropdown id="agent-language" label="Language" value={language} disabled={busy} options={langOpts()} onChange={setLanguage}/></div>
 <label className="choice-row"><input type="checkbox" role="switch" checked={voice} disabled={busy} onChange={e=>setVoice(e.target.checked)}/>Voice {voice?'on':'off'}</label>
 {member&&<div className="form-field"><label htmlFor="agent-approval">Approval mode</label>{settings.loading?<p>Loading…</p>:settings.error?<ErrorState retry={settings.reload}/>:admin?<Dropdown id="agent-approval" label="Approval mode" value={mode} disabled={busy} options={[{value:'important',label:'Ask before important actions'},{value:'every',label:'Ask before every action'}]} onChange={setMode}/>:<p>{mode==='every'?'Ask before every action':'Ask before important actions'}</p>}</div>}
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<Button type="submit" busy={busy} disabled={!!member&&(settings.loading||!!settings.error)}>Save</Button>
 </form>}<Link href="/settings/agent/log">Memory</Link><Link href="/how-agent-works">How your Agent works</Link></div>;
}
/** LEARN15 Memory: what the Agent remembers about him, in plain lines. He edits or deletes his own lines, or tells the Agent. No switches. */
type Note={id:string;body:string;label:string;scope:string};
export function PersonalAgentLog(){
 const {member,me}=useApp(),base=member?`/api/workspaces/${member.workspace_id}`:null,learning=useResource<{data:Note[]}>(base?`${base}/assistant/learning`:null),prefs=useResource<{preferred_name?:string|null;language?:string|null}>('/api/me/preferences');
 const [body,setBody]=useState(''),[scope,setScope]=useState('personal'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<{id:string;body:string}|null>(null),[confirmReset,setConfirmReset]=useState(false);
 const run=async(f:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await f();await learning.reload();}catch(e){setError(e instanceof Error?e.message:'Could not save. Try again.');}finally{setBusy(false);}};
 const save=()=>base&&run(async()=>{await request(`${base}/assistant/learning`,{method:'POST',body:JSON.stringify({body,scope})});setBody('');});
 const saveEdit=()=>base&&editing&&run(async()=>{await request(`${base}/assistant/learning/${editing.id}`,{method:'PATCH',body:JSON.stringify({body:editing.body})});setEditing(null);});
 const remove=(id:string)=>base&&run(()=>request(`${base}/assistant/learning/${id}`,{method:'DELETE'}));
 const reset=()=>base&&run(async()=>{await request(`${base}/assistant/learning`,{method:'DELETE'});setConfirmReset(false);});
 const notes=learning.data?.data??[],mine=notes.filter(n=>n.scope==='personal'),rules=notes.filter(n=>n.scope!=='personal');
 const lang=LANGUAGES.find(l=>l.code===(prefs.data?.language??DEFAULT_LANGUAGE));
 return <div className="page stack agent-settings memory-page"><Link href="/settings/agent">Back to Agent</Link><h1>Memory</h1>
 <p>What your Agent remembers about you. Only you see this. Tell your Agent to forget something, or change it here.</p>
 <ul className="action-list memory-summary"><li><div><strong>Calls you</strong><p data-no-translate>{prefs.data?.preferred_name||me.user.name||'Not set yet'}</p></div></li><li><div><strong>Language</strong><p data-no-translate>{lang?.native===lang?.name?lang?.name:`${lang?.name}, ${lang?.native}`}</p></div></li></ul>
 <h2>About you</h2>
 {learning.error?<ErrorState retry={learning.reload}/>:!mine.length?<p>Nothing yet. Try telling your Agent: I start at 7 now.</p>:<ul className="action-list">{mine.map(n=><li key={n.id}>{editing?.id===n.id?<div className="stack compact memory-edit"><label className="form-field">Change this line<textarea value={editing.body} maxLength={2000} onChange={e=>setEditing({id:n.id,body:e.target.value})}/></label><div className="row"><Button busy={busy} disabled={!editing.body.trim()} onClick={()=>void saveEdit()}>Save</Button><Button variant="secondary" onClick={()=>setEditing(null)}>Cancel</Button></div></div>:<><div><p data-no-translate>{n.body}</p></div><div className="row memory-actions"><Button variant="secondary" disabled={busy} onClick={()=>setEditing({id:n.id,body:n.body})}>Edit</Button><Button variant="secondary" disabled={busy} onClick={()=>void remove(n.id)}>Delete</Button></div></>}</li>)}</ul>}
 {rules.length>0&&<><h2>Company rules</h2><ul className="action-list">{rules.map(n=><li key={n.id}><div><p data-no-translate>{n.body}</p></div></li>)}</ul></>}
 <label className="form-field">Remember this<textarea value={body} maxLength={2000} onChange={e=>setBody(e.target.value)}/></label>{member?.role==='admin'&&<label className="form-field">Who is this for<select value={scope} onChange={e=>setScope(e.target.value)}><option value="personal">Only me</option><option value="company_rule">Company rule</option></select></label>}<Button busy={busy} disabled={!body.trim()} onClick={()=>void save()}>Save</Button>
 {mine.length>0&&(confirmReset?<div className="stack compact" role="group" aria-label="Reset memory"><p>Forget everything your Agent knows about you? Company rules stay.</p><div className="row"><Button busy={busy} onClick={()=>void reset()}>Yes, forget all</Button><Button variant="secondary" onClick={()=>setConfirmReset(false)}>Keep</Button></div></div>:<Button variant="secondary" onClick={()=>setConfirmReset(true)}>Reset everything</Button>)}
 {error&&<p role="alert">{error}</p>}{base&&<div id="decision-log"><AgentLog base={base} full/></div>}</div>;
}
