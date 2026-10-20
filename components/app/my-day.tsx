'use client';
import { enqueue } from '../../lib/ui/outbox';
import { useLocalDraft } from '../../lib/ui/drafts';
import { useSelection } from './selection';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { AssistantComposer } from './assistant';
import { Greeting } from './greeting';
import { MyAgentQuestions } from './agent-questions';
import { useUiLang } from './use-ui-lang';
import type { ReactNode } from 'react';
import { formatInLang } from '../../lib/date-lang';
import { CheckCircle2, MapPin, Phone, Play } from 'lucide-react';
import { PageHeader } from '../ui/layout';
import { Badge, Button, Dialog, EmptyState, ErrorState, Skeleton, useToast } from '../ui';
import { request, RequestError } from '../../lib/ui/api';
import { statusLabels } from '../../lib/ui/work-orders';
import { tradeLabels, type Trade } from '../../lib/trades';
import { useApp } from './context';
import { useResource } from './resource';
import { NoAccess } from './no-access';
import { AddPhoto, type Photo } from './job-photos';
import { AgentCard } from './dashboard';
import { LeaveRequests, RequestTimeOff } from './time-off';

type Job = { tenant_unit?:string|null; heat_warning?: string|null; outdoor?: boolean; id: string; order_number: number; title: string; status: string; priority: string; trade: string | null; scheduled_for: string | null; due_on: string | null; updated_at: string; site_name: string; address: string | null; building: string | null; area: string | null; access_notes: string | null; contact_name: string | null; contact_phone: string | null };
type Day = { timezone: string; today: Job[]; late: Job[]; next: Job[]; done: number };

/** The one next step for a worker. Open jobs wait for the office to set a time. */
export function nextStep(status: string): { to: string; label: string } | null {
  if (status === 'scheduled' || status === 'waiting_on_parts') return { to: 'in_progress', label: 'Start' };
  if (status === 'in_progress') return { to: 'done', label: 'Done' };
  return null;
}
const time = (v: string | null, tz: string, lang?: string) => v ? formatInLang(v, { hour: 'numeric', minute: '2-digit', timeZone: tz }, lang) : '';
const day = (v: string | null, tz: string, lang?: string) => v ? formatInLang(v, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }, lang) : '';
const mapUrl = (j: Job) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([j.building, j.address, j.area].filter(Boolean).join(', ') || j.site_name)}`;

type Outcome = 'fixed' | 'temporary' | 'needs_part' | 'cant_fix';
type JobRecord = { month: number; total: number };
const OUTCOMES: { v: Outcome; label: string; hint: string }[] = [
  { v: 'fixed', label: 'Fixed', hint: 'The job is finished.' },
  { v: 'temporary', label: 'Temporary fix', hint: 'It works for now. The office will plan a return visit.' },
  { v: 'needs_part', label: 'Needs a part', hint: 'The job waits until the part comes.' },
  { v: 'cant_fix', label: "Can't be fixed", hint: 'Your supervisor will look at it.' },
];

/** The job report: what was wrong, what you did, how it ended. Nothing here is required, and the after photo never blocks finishing. */
export function DoneDialog({ j, base, onClose, onSaved }: { j: Job; base: string; onClose: () => void; onSaved: (outcome: Outcome, record: JobRecord) => void }) {
  const photos = useResource<Photo[]>(`${base}/work-orders/${j.id}/photos`), after = (Array.isArray(photos.data) ? photos.data : []).filter(p => p.kind === 'after').length;
  const {me,member}=useApp();
  const [draft,setDraft,clearDraft]=useLocalDraft(`groundwork-report:${me.user.id}:${member?.workspace_id}:${j.id}`,{problem:'',work:'',part:'',outcome:null as Outcome|null});
  const {problem,work,outcome}=draft;const setProblem=(problem:string)=>setDraft(d=>({...d,problem})),setWork=(work:string)=>setDraft(d=>({...d,work})),setOutcome=(outcome:Outcome)=>setDraft(d=>({...d,outcome}));
  const [busy,setBusy]=useState(false),toast=useToast();
  // TECH08: say it in his own language; the Agent fills the fields only from his words. Nothing saves until Job done.
  const prefs=useResource<{language:string}>('/api/me/preferences'),lang=prefs.data?.language??'en';
  const [words,setWords]=useState(''),wordsRef=useRef<HTMLTextAreaElement|null>(null),[filling,setFilling]=useState(false),[question,setQuestion]=useState<string|null>(null),[english,setEnglish]=useState<{problem_en:string;work_en:string}|null>(null);
  async function fill(){if(!words.trim()||filling)return;setFilling(true);setQuestion(null);try{const r=await request<{problem:string;work:string;outcome:Outcome|null;problem_en:string;work_en:string;question:string|null}>(`${base}/work-orders/${j.id}/report/voice`,{method:'POST',body:JSON.stringify({words,language:lang})});
    setDraft(d=>({...d,problem:r.problem||d.problem,work:r.work||d.work,outcome:r.outcome??d.outcome}));setEnglish({problem_en:r.problem_en,work_en:r.work_en});setQuestion(r.question);setWords('');}
   catch{toast('Could not fill the report. Type it below instead.');}finally{setFilling(false);}}
  async function save() {
    if(!outcome)return;
    setBusy(true);
    const payload=JSON.stringify({problem,work,part:draft.part??'',outcome,...(english?{problem_en:english.problem_en,work_en:english.work_en,language:lang}:{}),updated_at:j.updated_at});const key=crypto.randomUUID();
    const queue=()=>{enqueue(me.user.id,member!.workspace_id,{id:key,url:`${base}/work-orders/${j.id}/report`,body:payload,label:`Job report for WO ${j.order_number}`});clearDraft();toast('Waiting to send');onClose();};
    try { if(navigator.onLine===false){queue();return;}const r = await request<{ record: JobRecord }>(`${base}/work-orders/${j.id}/report`, { method: 'POST', headers:{'Idempotency-Key':key},body:payload }); clearDraft();onSaved(outcome, r.record); }
    catch (e) { if(e instanceof RequestError&&e.status===0){try{queue();}catch{toast('Could not keep this report on your phone. Your draft is saved.');}return;}toast(e instanceof RequestError && e.status === 409 ? 'This job changed. We loaded the new version.' : 'That did not save. Try again.'); }
    finally { setBusy(false); }
  }
  const pick = OUTCOMES.find(o => o.v === outcome);
  return <Dialog open onClose={onClose} busy={busy} title="Job report" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!outcome} onClick={() => void save()}><CheckCircle2 size={18} aria-hidden="true" />{outcome === 'fixed' || outcome === 'temporary' ? 'Job done' : 'Save report'}</Button></>}>
    <div className="stack compact job-report"><strong data-no-translate>{j.title}</strong>{j.tenant_unit&&<span className="small muted"><span>Flat or unit</span>: <span data-no-translate>{j.tenant_unit}</span></span>}
      <div className="voice-report stack compact"><span className="field-label">Say what you found and did, in your language</span><AssistantComposer ws={member?.workspace_id??''} language={lang} input={words} setInput={setWords} inputRef={wordsRef} busy={filling} blocked={false} active submit={()=>void fill()} inputLabel="Your words" placeholder="Speak or type"/><Button variant="secondary" busy={filling} disabled={!words.trim()} onClick={()=>void fill()}>Fill report</Button>{question&&<p className="voice-question" role="status">{question}</p>}</div>
      <label className="field"><span>What was the problem?</span><textarea rows={2} value={problem} onChange={e => setProblem(e.target.value)} placeholder="For example: the AC was leaking water" /></label>
      <label className="field"><span>What did you do?</span><textarea rows={2} value={work} onChange={e => setWork(e.target.value)} placeholder="For example: cleaned the drain pipe" /></label>
      <fieldset className="outcome-pick"><legend>How did it end?</legend>
        <div className="outcome-grid">{OUTCOMES.map(o => <button key={o.v} type="button" className={`outcome ${outcome === o.v ? 'on' : ''}`} aria-pressed={outcome === o.v} onClick={() => setOutcome(o.v)}>{o.label}</button>)}</div>
        <p className="small muted">{pick?pick.hint:'Pick how it ended. Nothing is chosen for you.'}</p></fieldset>
      {outcome==='needs_part'&&<label className="field"><span>Which part?</span><input maxLength={200} value={draft.part??''} onChange={e=>setDraft(d=>({...d,part:e.target.value}))}/></label>}
      {after ? <p className="small">After photos: {after}</p> : <p className="small">An after photo shows the client the work is done.</p>}
      <div><AddPhoto base={base} id={j.id} kind="after" primary={false} onAdded={() => void photos.reload()} /></div></div>
  </Dialog>;
}

function JobCard({ j:original, tz, base, onDone, onFinished, when, primary=false,selection }: { selection?:ReturnType<typeof useSelection>;primary?: boolean; j: Job; tz: string; base: string; onDone: () => void; onFinished: (o: Outcome, r: JobRecord) => void; when: ReactNode }) {
  const [optimistic,setOptimistic]=useState<string|null>(null);const j=optimistic?{...original,status:optimistic}:original;
  useEffect(()=>setOptimistic(null),[original.updated_at]);
  const step = nextStep(j.status), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), toast = useToast();
  async function go() {
    if (!step||busy) return; setBusy(true);const previous=j.status;setOptimistic(step.to);
    try { const updated=await request<{updated_at:string}>(`${base}/work-orders/${j.id}`, { method: 'PATCH', body: JSON.stringify({ status: step.to, updated_at: j.updated_at }) }); toast('Started.',{label:'Undo',onClick:async()=>{setOptimistic(previous);try{await request(`${base}/work-orders/${j.id}`,{method:'PATCH',body:JSON.stringify({status:previous,undo_status:true,updated_at:updated.updated_at})});onDone();}catch(e){setOptimistic(step.to);throw e;}}}); onDone(); }
    catch (e) { setOptimistic(null);toast(e instanceof RequestError && e.status === 409 ? 'This job changed. We loaded the new version.' : 'Could not start this job. Your change was undone. Try again.'); onDone(); }
    finally { setBusy(false); }
  }
  return <li className="day-card" {...selection?.row(j.id)}>{selection?.mark(j.id)}
    <div className="day-when"><strong>{when}</strong>{j.status !== 'scheduled' && <Badge>{statusLabels[j.status] ?? j.status}</Badge>}{j.priority === 'urgent' && <Badge tone="warning">Urgent</Badge>}</div>
    <Link href={`/work-orders/${j.id}`} className="day-title"><strong data-no-translate>{j.title}</strong>{j.tenant_unit&&<span className="small muted"><span>Flat or unit</span>: <span data-no-translate>{j.tenant_unit}</span></span>}<span className="small muted">{[j.site_name, j.area].filter(Boolean).join(' · ')}{j.trade ? ` · ${tradeLabels[j.trade as Trade] ?? j.trade}` : ''}</span></Link>{j.heat_warning&&<p className="heat-note" role="note">{j.heat_warning}</p>}
    {j.access_notes && <p className="small day-note">{j.access_notes}</p>}
    <div className="day-actions">
      {step ? <Button variant={primary?'primary':'secondary'} busy={busy} onClick={() => step.to === 'done' ? setConfirm(true) : void go()}>{step.to === 'done' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}{step.label}</Button> : <span className="small muted">Waiting for a time</span>}
      <a className="button secondary" href={mapUrl(j)} target="_blank" rel="noreferrer"><MapPin size={18} aria-hidden="true" />Map</a>
      {j.contact_phone && <a className="button secondary" href={`tel:${j.contact_phone.replace(/[^+0-9]/g, '')}`} aria-label={`Call ${j.contact_name ?? 'the site'}`}><Phone size={18} aria-hidden="true" />Call</a>}
    </div>
    {confirm && <DoneDialog j={j} base={base} onClose={() => setConfirm(false)} onSaved={(o, r) => { setConfirm(false); onFinished(o, r); onDone(); }} />}
  </li>;
}

const moment: Record<Outcome, string> = { fixed: 'Job done. Great work!', temporary: 'Job done for now. The office will plan the return visit.', needs_part: 'Report saved. The job waits for the part.', cant_fix: 'Report saved. Your supervisor will take it from here.' };

/** The "job done" moment: a short thank you and this month's count. */
function DoneMoment({ outcome, record, onClose }: { outcome: Outcome; record: JobRecord; onClose: () => void }) {
  return <div className="done-moment" role="status">
    <div><strong>{moment[outcome]}</strong><p className="small">You finished {record.month} {record.month === 1 ? 'job' : 'jobs'} this month and {record.total} in total.</p></div>
    <Button variant="secondary" onClick={onClose}>Close</Button></div>;
}

export function MyDay() {
  const { member } = useApp(), base = `/api/workspaces/${member?.workspace_id}`, d = useResource<Day>(member && member.role !== 'client' ? `${base}/my-day` : null);
  const { me } = useApp();
  const rec = useResource<JobRecord>(member && member.role !== 'client' ? `${base}/members/${me.user.id}/record` : null);
  const [done, setDone] = useState<{ outcome: Outcome; record: JobRecord } | null>(null);
  const selection=useSelection([...(d.data?.today??[]),...(d.data?.late??[]),...(d.data?.next??[])].map(j=>j.id),[{label:'Open job',available:ids=>ids.length===1,run:ids=>{window.location.href=`/work-orders/${ids[0]}`;}}]);
  const lang = useUiLang();
  if (member?.role === 'client') return <NoAccess />;
  const data = d.data, tz = data?.timezone ?? 'Asia/Dubai', reload = () => { void d.reload(); void rec.reload(); };
  const primaryJob = [...(data?.today??[]),...(data?.late??[])].find(j=>j.status==='in_progress')??[...(data?.today??[]),...(data?.late??[])].find(j=>nextStep(j.status));
  const finished = (outcome: Outcome, record: JobRecord) => setDone({ outcome, record });
  return <div className="page stack my-day">
    {selection.bar}<Greeting tz={tz}/><PageHeader><div><h1>Today</h1><p data-no-translate suppressHydrationWarning>{formatInLang(new Date(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }, lang)}</p>{rec.data && <p className="small job-count">Jobs done: {rec.data.month} this month, {rec.data.total} in total</p>}</div>{data&&!primaryJob&&<Link className="button primary" href="/work-orders">View jobs</Link>}</PageHeader>{member?.workspace_id&&<MyAgentQuestions base={base}/>}<Link className="button secondary" href="/suggestions/new">Suggest a job</Link>{member?.role==='technician'&&<Link className="button secondary" href="/my-record">My record</Link>}
    {member?.role === 'technician' && <AgentCard />}
    {member && <div className="row"><RequestTimeOff base={`/api/workspaces/${member.workspace_id}`} /></div>}
    {member && <LeaveRequests base={`/api/workspaces/${member.workspace_id}`} self={me.user.id} />}
    {done && <DoneMoment outcome={done.outcome} record={done.record} onClose={() => setDone(null)} />}
    {d.loading ? <Skeleton className="skeleton-card" /> : d.error || !data ? <ErrorState retry={d.reload} /> : <>
      {data.late.length > 0 && <section id="late" className="stack compact"><h2>Late</h2><ul className="day-list">{data.late.map(j => <JobCard key={j.id} selection={selection} j={j} primary={j.id===primaryJob?.id} tz={tz} base={base} onDone={reload} onFinished={finished} when={<>Due <span data-no-translate>{day(j.due_on, tz, lang)}</span></>} />)}</ul></section>}
      <section id="today" className="stack compact"><h2>Today</h2>{data.today.length ? <ul className="day-list">{data.today.map(j => <JobCard key={j.id} selection={selection} j={j} primary={j.id===primaryJob?.id} tz={tz} base={base} onDone={reload} onFinished={finished} when={<span data-no-translate>{time(j.scheduled_for, tz, lang)}</span>} />)}</ul>
        : <EmptyState title={data.done ? 'All done for today' : 'No jobs today'}>{data.next[0] ? `Next: ${data.next[0].title}, ${day(data.next[0].scheduled_for, tz, 'en')}.` : 'When the office gives you a job, it shows here.'}</EmptyState>}</section>
      {data.next.length > 0 && <section className="stack compact"><h2>Next days</h2><ul className="day-list">{data.next.map(j => <li key={j.id} className="day-next" {...selection.row(j.id)}>{selection.mark(j.id)}<Link href={`/work-orders/${j.id}`}><strong data-no-translate>{day(j.scheduled_for, tz, lang)}</strong> <span data-no-translate>{time(j.scheduled_for, tz, lang)}</span> · {j.title}{j.tenant_unit&&<span data-no-translate>{` · ${j.tenant_unit}`}</span>}</Link></li>)}</ul></section>}
      <p className="small"><Link href="/work-orders">All my jobs</Link></p>
    </>}
  </div>;
}
