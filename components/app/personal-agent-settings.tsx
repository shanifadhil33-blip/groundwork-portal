'use client';
import { DemoDecisionText } from './demo-decision-text';
import { REPLY_LENGTHS, replyLengthLabels, type ReplyLength } from '../../lib/agent/replylength';
import { AVATARS, AVATAR_LABELS } from '../../lib/avatars';
import { AgentAvatar } from './agent-avatar';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LANGUAGES, DEFAULT_LANGUAGE, languageOptions as langOpts } from '../../lib/languages';
import { request, RequestError } from '../../lib/ui/api';
import { Button, Dropdown, ErrorState, ConfirmDialog } from '../ui';
import { useApp } from './context';
import { useResource } from './resource';
import { changeAppLanguage } from './translator';
import type { Words,AgentWord } from '../../lib/services/agent-words';
import { AgentLog } from './dashboard';
export type AgentPreferences={agent_avatar?:string|null;agent_name:string|null;voice_enabled:boolean;reply_length?:ReplyLength;language:string|null};
export function PersonalAgentSettings(){
 const {member}=useApp(),prefs=useResource<AgentPreferences>('/api/me/preferences');
 const base=member?`/api/workspaces/${member.workspace_id}`:null;
 const settings=useResource<{approval_mode:'important'|'every'}>(base?`${base}/settings`:null);
 const [name,setName]=useState(''),[avatar,setAvatar]=useState<string>('bot'),[language,setLanguage]=useState(DEFAULT_LANGUAGE),[voice,setVoice]=useState(true),[replyLength,setReplyLength]=useState<ReplyLength>('normal'),[mode,setMode]=useState('important'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const admin=member?.role==='admin';
 useEffect(()=>{if(prefs.data){setName(prefs.data.agent_name??'');setAvatar(prefs.data.agent_avatar??'bot');setLanguage(prefs.data.language??DEFAULT_LANGUAGE);setVoice(prefs.data.voice_enabled);setReplyLength(prefs.data.reply_length??'normal');}},[prefs.data]);
 useEffect(()=>{if(settings.data)setMode(settings.data.approval_mode);},[settings.data]);
 async function save(){setBusy(true);setError('');setNotice('');try{
  await request('/api/me/preferences',{method:'PATCH',body:JSON.stringify({agent_name:name,agent_avatar:avatar,language,voice_enabled:voice,reply_length:replyLength})});
  changeAppLanguage(language);window.dispatchEvent(new Event('groundwork-retry-resources'));
  if(admin&&base&&mode!==settings.data?.approval_mode)await request(`${base}/settings`,{method:'PATCH',body:JSON.stringify({approval_mode:mode})});
  setNotice('Agent settings saved.');
 }catch(e){setError(e instanceof RequestError?e.message:'We could not save your settings. Please try again.');}finally{setBusy(false);}}
 return <div className="page stack agent-settings"><Link href="/settings">Back to settings</Link><h1>Agent</h1>{prefs.loading?<p>Loading settings…</p>:prefs.error?<ErrorState retry={prefs.reload}/>:<form className="stack" onSubmit={e=>{e.preventDefault();void save();}}>
 <label className="form-field">Name<input value={name} maxLength={40} placeholder="Agent" disabled={busy} onChange={e=>setName(e.target.value)}/></label><p>Leave the name empty to use Agent.</p>
 <fieldset className="avatar-pick"><legend>Picture</legend><div className="avatar-grid" role="radiogroup" aria-label="Picture">{AVATARS.map(a=><button key={a} type="button" role="radio" aria-checked={avatar===a} aria-label={AVATAR_LABELS[a]} className={avatar===a?'on':''} disabled={busy} onClick={()=>setAvatar(a)}><AgentAvatar avatar={a} size={24}/></button>)}</div></fieldset>
 <div className="form-field"><label htmlFor="agent-language">Language</label><Dropdown id="agent-language" label="Language" value={language} disabled={busy} options={langOpts()} onChange={setLanguage}/></div>
 <div><label htmlFor="replylength">Reply length</label><Dropdown id="replylength" label="Reply length" value={replyLength} disabled={busy} options={REPLY_LENGTHS.map(value=>({value,label:replyLengthLabels[value]}))} onChange={value=>setReplyLength(value as ReplyLength)}/></div>
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
 <UsualContext/>
 <AgentWords/>
 <h2>About you</h2>
 {learning.error?<ErrorState retry={learning.reload}/>:!mine.length?<p>Nothing yet. Try telling your Agent: I start at 7 now.</p>:<ul className="action-list">{mine.map(n=><li key={n.id}>{editing?.id===n.id?<div className="stack compact memory-edit"><label className="form-field">Change this line<textarea value={editing.body} maxLength={2000} onChange={e=>setEditing({id:n.id,body:e.target.value})}/></label><div className="row"><Button busy={busy} disabled={!editing.body.trim()} onClick={()=>void saveEdit()}>Save</Button><Button variant="secondary" onClick={()=>setEditing(null)}>Cancel</Button></div></div>:<><div><p><DemoDecisionText text={n.body}/></p></div><div className="row memory-actions"><Button variant="secondary" disabled={busy} onClick={()=>setEditing({id:n.id,body:n.body})}>Edit</Button><Button variant="secondary" disabled={busy} onClick={()=>void remove(n.id)}>Delete</Button></div></>}</li>)}</ul>}
 {rules.length>0&&<><h2>Company rules</h2><ul className="action-list">{rules.map(n=><li key={n.id}><div><p><DemoDecisionText text={n.body}/></p></div></li>)}</ul></>}
 <label className="form-field">Remember this<textarea value={body} maxLength={2000} onChange={e=>setBody(e.target.value)}/></label>{member?.role==='admin'&&<label className="form-field">Who is this for<select value={scope} onChange={e=>setScope(e.target.value)}><option value="personal">Only me</option><option value="company_rule">Company rule</option></select></label>}<Button busy={busy} disabled={!body.trim()} onClick={()=>void save()}>Save</Button>
 {mine.length>0&&(confirmReset?<div className="stack compact" role="group" aria-label="Reset memory"><p>Forget everything your Agent knows about you? Company rules stay.</p><div className="row"><Button busy={busy} onClick={()=>void reset()}>Yes, forget all</Button><Button variant="secondary" onClick={()=>setConfirmReset(false)}>Keep</Button></div></div>:<Button variant="secondary" onClick={()=>setConfirmReset(true)}>Reset everything</Button>)}
 {error&&<p role="alert">{error}</p>}{base&&<div id="decision-log"><AgentLog base={base} full/></div>}</div>;
}

function UsualContext(){
 const usual=useResource<{usual_start:string|null;usual_areas:string[]}>('/api/me/usual');
 const [start,setStart]=useState(''),[areas,setAreas]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');
 useEffect(()=>{if(!usual.data)return;setStart(usual.data.usual_start??'');setAreas((usual.data.usual_areas??[]).join(', '));},[usual.data]);
 async function save(){setBusy(true);setError('');setSaved('');try{const list=areas.split(',').map(part=>part.trim()).filter(Boolean);await request('/api/me/usual',{method:'PUT',body:JSON.stringify({...(start?{start}:{}),...(list.length?{areas:list}:{})})});setSaved('Saved. Your Memory page shows it.');await usual.reload();}catch(e){setError(e instanceof Error?e.message:'Could not save. Try again.');}finally{setBusy(false);}}
 const hours=Array.from({length:15},(_,i)=>{const hour=String(i+6).padStart(2,'0');return {value:`${hour}:00`,label:`${hour}:00`,noTranslate:true};});
 return <section className="stack"><h2>Usual start</h2>
  <div className="form-field"><label htmlFor="usual-start">Usual start</label><Dropdown id="usual-start" label="Usual start" value={start} options={[{value:'',label:'Not set yet'},...hours]} onChange={setStart}/></div>
  <label className="form-field">Usual areas<input value={areas} maxLength={200} onChange={e=>setAreas(e.target.value)} style={{minHeight:44}}/></label>
  <Button busy={busy} disabled={!start&&!areas.trim()} onClick={()=>void save()}>Save</Button>
  {saved&&<p role="status">{saved}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
function AgentWords(){
 const {member}=useApp(),base=member?`/api/workspaces/${member.workspace_id}`:null;
 const words=useResource<Words>(base?`${base}/words`:null),sites=useResource<{id:string;name:string}[]>(base?`${base}/suggestion-sites`:null),assets=useResource<{id:string;name:string}[]>(base?`${base}/assets`:null);
 const [phrase,setPhrase]=useState(''),[means,setMeans]=useState('other'),[text,setText]=useState(''),[scope,setScope]=useState('personal'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[removing,setRemoving]=useState<AgentWord|null>(null),[done,setDone]=useState('');
 const admin=member?.role==='admin';
 async function run(work:()=>Promise<unknown>,ok:string){setBusy(true);setError('');setDone('');try{await work();await words.reload();setDone(ok);}catch(e){setError(e instanceof Error?e.message:'Could not save. Try again.');}finally{setBusy(false);}}
 async function save(){if(!base)return;await run(async()=>{const [kind,id]=means.split(':');await request(`${base}/words`,{method:'POST',body:JSON.stringify({phrase,scope,means_kind:kind,...(id?{means_id:id}:{means_text:text})})});setPhrase('');setText('');},'Word added.');}
 const options=[...(sites.data??[]).map(s=>({value:`site:${s.id}`,label:s.name,noTranslate:true})),...(assets.data??[]).map(a=>({value:`asset:${a.id}`,label:a.name,noTranslate:true})),{value:'other',label:'Something else'}];
 const group=(title:string,list:AgentWord[],canRemove:boolean)=><><h3>{title}</h3>{list.length===0?<p className="muted">No words yet.</p>:<ul className="action-list">{list.map(w=><li key={w.id}><div><strong data-no-translate>{w.phrase}</strong><p data-no-translate>{w.means_text}</p></div>{canRemove&&<Button variant="secondary" disabled={busy} onClick={()=>setRemoving(w)}>Delete</Button>}</li>)}</ul>}</>;
 return <section className="stack"><h2>Words</h2>{words.loading?<p>Loading…</p>:words.error?<ErrorState retry={words.reload}/>:<>{group('Your words',words.data?.personal??[],true)}{member?.role!=='client'&&group('Company words',words.data?.company??[],admin)}</>}
 <form className="stack compact" onSubmit={e=>{e.preventDefault();void save();}}>
 <label className="form-field">Word<input value={phrase} maxLength={60} disabled={busy} onChange={e=>setPhrase(e.target.value)} style={{minHeight:44}}/></label>
 <div className="form-field"><label htmlFor="word-means">Means</label><Dropdown id="word-means" label="Means" value={means} options={options} disabled={busy||sites.loading||assets.loading} onChange={setMeans}/></div>
 {means==='other'&&<label className="form-field">Something else<input value={text} maxLength={200} disabled={busy} onChange={e=>setText(e.target.value)} style={{minHeight:44}}/></label>}
 {admin&&<div className="form-field"><label htmlFor="word-scope">Who is this for</label><Dropdown id="word-scope" label="Who is this for" value={scope} options={[{value:'personal',label:'Your words'},{value:'company',label:'Company words'}]} disabled={busy} onChange={setScope}/></div>}
 {sites.error&&<ErrorState retry={sites.reload}/>} {assets.error&&<ErrorState retry={assets.reload}/>}
 <Button type="submit" busy={busy} disabled={!phrase.trim()||(means==='other'&&!text.trim())}>Add word</Button>
 </form>{error&&!removing&&<p role="alert">{error}</p>}{done&&<p role="status">{done}</p>}
 <ConfirmDialog open={!!removing} title="Remove this word?" confirmLabel="Delete" danger busy={busy} error={error} onClose={()=>{setRemoving(null);setError('');}} onConfirm={()=>void run(async()=>{await request(`${base}/words/${removing!.id}`,{method:'DELETE'});setRemoving(null);},'Word removed.')}><p data-no-translate>{removing?.phrase}</p></ConfirmDialog>
 </section>;
}
