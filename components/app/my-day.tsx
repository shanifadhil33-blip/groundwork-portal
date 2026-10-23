'use client';
import { useNameJoin } from './use-name-join';
import { JobChecklistCard } from './job-checklists';
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
import { Button, Dialog, ErrorState, Skeleton, useToast } from '../ui';
import { request, RequestError } from '../../lib/ui/api';
import { statusLabels } from '../../lib/ui/work-orders';
import { tradeLabels, type Trade } from '../../lib/trades';
import { useApp } from './context';
import { useResource } from './resource';
import { NoAccess } from './no-access';
import { AddPhoto, type Photo } from './job-photos';
import { AgentCard } from './dashboard';
import { HabitCard } from './habits';
import { FullDoneCard } from './job-close';
import { LeaveRequests, RequestTimeOff } from './time-off';

type Job = { tenant_unit?:string|null; id: string; order_number: number; title: string; status: string; priority: string; trade: string | null; scheduled_for: string | null; due_on: string | null; updated_at: string; site_name: string; address: string | null; building: string | null; area: string | null; access_notes: string | null; contact_name: string | null; contact_phone: string | null };
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
type DoneExtra = { problem: string; work: string; before: number; after: number; name: string };
const OUTCOMES: { v: Outcome; label: string; hint: string }[] = [
  { v: 'fixed', label: 'Fixed', hint: 'The job is finished.' },
  { v: 'temporary', label: 'Temporary fix', hint: 'It works for now. The office will plan a return visit.' },
  { v: 'needs_part', label: 'Needs a part', hint: 'The job waits until the part comes.' },
  { v: 'cant_fix', label: "Can't be fixed", hint: 'Your supervisor will look at it.' },
];

/** The job report: what was wrong, what you did, how it ended. Nothing here is required, and the after photo never blocks finishing. */
export function DoneDialog({ j, base, onClose, onSaved }: { j: Job; base: string; onClose: () => void; onSaved: (outcome: Outcome, record: JobRecord, extra?: DoneExtra) => void }) {
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
    try { if(navigator.onLine===false){queue();return;}const r = await request<{ record: JobRecord }>(`${base}/work-orders/${j.id}/report`, { method: 'POST', headers:{'Idempotency-Key':key},body:payload }); clearDraft();
      const list = Array.isArray(photos.data) ? photos.data : [];
      onSaved(outcome, r.record, { problem, work, before: list.filter(p => p.kind === 'before').length, after: list.filter(p => p.kind === 'after').length, name: me.user.name ?? '' }); }
    catch (e) { if(e instanceof RequestError&&e.status===0){try{queue();}catch{toast('Could not keep this report on your phone. Your draft is saved.');}return;}toast(e instanceof RequestError && e.status === 409 ? 'This job changed. We loaded the new version.' : 'That did not save. Try again.'); }
    finally { setBusy(false); }
  }
  const pick = OUTCOMES.find(o => o.v === outcome);
  return <Dialog open onClose={onClose} busy={busy} title="Job report" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!outcome} onClick={() => void save()}><CheckCircle2 size={18} aria-hidden="true" />{outcome === 'fixed' || outcome === 'temporary' ? 'Job done' : 'Save report'}</Button></>}>
    <div className="stack compact job-report"><strong data-no-translate>{j.title}</strong>{j.tenant_unit&&<span className="small muted"><span>Flat or unit</span>: <span data-no-translate>{j.tenant_unit}</span></span>}
      <JobChecklistCard base={base} id={j.id}/><div className="voice-report stack compact"><span className="field-label">Say what you found and did, in your language</span><AssistantComposer ws={member?.workspace_id??''} language={lang} input={words} setInput={setWords} inputRef={wordsRef} busy={filling} blocked={false} active submit={()=>void fill()} inputLabel="Your words" placeholder="Speak or type"/><Button variant="secondary" busy={filling} disabled={!words.trim()} onClick={()=>void fill()}>Fill report</Button>{question&&<p className="voice-question" role="status">{question}</p>}</div>
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

const PRIORITY: Record<string, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
/** Start or finish a job with an optimistic status and Undo; Done opens the job report. */
function useJobStep(original: Job, base: string, onDone: () => void) {
  const [optimistic,setOptimistic]=useState<string|null>(null);const j=optimistic?{...original,status:optimistic}:original;
  useEffect(()=>setOptimistic(null),[original.updated_at]);
  const step = nextStep(j.status), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), toast = useToast();
  async function go() {
    if (!step||busy) return; setBusy(true);const previous=j.status;setOptimistic(step.to);
    try { const updated=await request<{updated_at:string}>(`${base}/work-orders/${j.id}`, { method: 'PATCH', body: JSON.stringify({ status: step.to, updated_at: j.updated_at }) }); toast('Started.',{label:'Undo',onClick:async()=>{setOptimistic(previous);try{await request(`${base}/work-orders/${j.id}`,{method:'PATCH',body:JSON.stringify({status:previous,undo_status:true,updated_at:updated.updated_at})});onDone();}catch(e){setOptimistic(step.to);throw e;}}}); onDone(); }
    catch (e) { setOptimistic(null);toast(e instanceof RequestError && e.status === 409 ? 'This job changed. We loaded the new version.' : 'Could not start this job. Your change was undone. Try again.'); onDone(); }
    finally { setBusy(false); }
  }
  return { j, step, busy, confirm, setConfirm, go };
}

/** The title opens job details; the panel ends with the main action and call. */
function NextJobHero({ j: original, tz, base, lang, onDone, onFinished, when }: { j: Job; tz: string; base: string; lang?: string; onDone: () => void; onFinished: (o: Outcome, r: JobRecord, extra?: DoneExtra) => void; when: ReactNode }) {
  const { j, step, busy, confirm, setConfirm, go } = useJobStep(original, base, onDone);
  const [flipped, setFlipped] = useState(false), frontBtn = useRef<HTMLButtonElement|null>(null), backBtn = useRef<HTMLButtonElement|null>(null), moved = useRef(false);
  useEffect(() => { if (!moved.current) return; (flipped ? backBtn : frontBtn).current?.focus({ preventScroll: true }); }, [flipped]);
  const flip = (v: boolean) => { moved.current = true; setFlipped(v); };
  const joinNames = useNameJoin();
  const place = joinNames([j.building, j.site_name, j.area]);
  const tel = j.contact_phone ? `tel:${j.contact_phone.replace(/[^+0-9]/g, '')}` : null;
  return <section className="next-job stack compact" aria-labelledby="next-job-label">
    <p id="next-job-label" className="ds-label"><span>Next job</span> · {when}</p>
    <div className="flip" data-flipped={flipped}><div className="flip-inner">
      <div className="flip-face flip-front ds-hero next-job-face" inert={flipped} aria-hidden={flipped}>
        <div className="next-job-top">{j.priority === 'urgent' ? <span className="ds-chip-urgent">Urgent</span> : j.status !== 'scheduled' ? <span className="ds-chip-hero">{statusLabels[j.status] ?? j.status}</span> : <span />}<span className="ds-muted num" data-no-translate>WO {j.order_number}</span></div>
        <h2 className="next-job-title" data-no-translate><button type="button" ref={frontBtn} aria-pressed={false} aria-controls="next-job-back" onClick={() => flip(true)}>{j.title}</button></h2>
        {place && <p className="next-job-place"><MapPin size={18} aria-hidden="true" /><span data-no-translate>{place}</span></p>}
        {j.access_notes && <p className="ds-muted next-job-note">{j.access_notes}</p>}
        <div className="next-job-actions">
          {step ? <button type="button" className="ds-hero-btn" disabled={busy} aria-busy={busy} onClick={() => step.to === 'done' ? setConfirm(true) : void go()}>{step.to === 'done' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}{step.label}</button> : <span className="ds-muted">Waiting for a time</span>}
          {tel ? <a className="ds-hero-icon" href={tel} aria-label={`Call ${j.contact_name ?? 'the site'}`}><Phone size={20} aria-hidden="true" /></a> : <a className="ds-hero-icon" href={mapUrl(j)} target="_blank" rel="noreferrer" aria-label="Map"><MapPin size={20} aria-hidden="true" /></a>}
        </div>
      </div>
      <div id="next-job-back" className="flip-face flip-back ds-hero next-job-face" inert={!flipped} aria-hidden={!flipped}>
        <div className="next-job-top"><strong>Job details</strong><span className="ds-muted num" data-no-translate>WO {j.order_number}</span></div>
        <dl className="next-job-facts">
          {(j.contact_name || j.contact_phone) && <div><dt>Contact</dt><dd data-no-translate>{joinNames([j.contact_name, j.contact_phone])}</dd></div>}
          <div><dt>Address</dt><dd data-no-translate>{joinNames([j.building, j.address, j.area]) || j.site_name}</dd></div>
          {j.trade && <div><dt>Trade</dt><dd>{tradeLabels[j.trade as Trade] ?? j.trade}</dd></div>}
          {j.tenant_unit && <div><dt>Flat or unit</dt><dd data-no-translate>{j.tenant_unit}</dd></div>}
        </dl>
        <div className="next-job-actions next-job-back-actions"><a className="ds-hero-btn" href={mapUrl(j)} target="_blank" rel="noreferrer"><MapPin size={18} aria-hidden="true" />Map</a><button type="button" ref={backBtn} className="ds-flip-btn" aria-pressed={true} aria-controls="next-job-back" onClick={() => flip(false)}>Flip back</button></div>
      </div>
    </div></div>
    {confirm && <DoneDialog j={j} base={base} onClose={() => setConfirm(false)} onSaved={(o, r, extra) => { setConfirm(false); onFinished(o, r, extra); onDone(); }} />}
  </section>;
}

/** A job row: time, title and place, meta at the end. The whole row opens the job. */
function JobRow({ j, when, meta, selection }: { j: Job; when: ReactNode; meta?: ReactNode; selection?: ReturnType<typeof useSelection> }) {
  const joinNames = useNameJoin();
  return <li {...selection?.row(j.id)}>{selection?.mark(j.id)}<Link className="ds-row" href={`/work-orders/${j.id}`}><span className="ds-time">{when}</span><span className="ds-main"><strong data-no-translate>{j.title}</strong><span className="ds-sub" data-no-translate>{joinNames([j.building ?? j.site_name, j.area])}</span></span>{meta && <span className="ds-meta">{meta}</span>}</Link></li>;
}

/** TECH05: the full screen card after the report is saved. Counts stay under it. */
function DoneMoment({ outcome, record, extra, onClose }: { outcome: Outcome; record: JobRecord; extra?: DoneExtra; onClose: () => void }) {
  return <div className="stack">
    <FullDoneCard outcome={outcome} name={extra?.name ?? ''} problem={extra?.problem ?? ''} work={extra?.work ?? ''} before={extra?.before ?? 0} after={extra?.after ?? 0} onClose={onClose} />
    <p className="small done-count">You finished {record.month} {record.month === 1 ? 'job' : 'jobs'} this month and {record.total} in total.</p>
  </div>;
}

export function MyDay() {
  const { member } = useApp(), base = `/api/workspaces/${member?.workspace_id}`, d = useResource<Day>(member && member.role !== 'client' ? `${base}/my-day` : null);
  const { me } = useApp();
  const rec = useResource<JobRecord>(member && member.role !== 'client' ? `${base}/members/${me.user.id}/record` : null);
  const [done, setDone] = useState<{ outcome: Outcome; record: JobRecord; extra?: DoneExtra } | null>(null);
  const selection=useSelection([...(d.data?.today??[]),...(d.data?.late??[]),...(d.data?.next??[])].map(j=>j.id),[{label:'Open job',available:ids=>ids.length===1,run:ids=>{window.location.href=`/work-orders/${ids[0]}`;}}]);
  const lang = useUiLang();
  if (member?.role === 'client') return <NoAccess />;
  const data = d.data, tz = data?.timezone ?? 'Asia/Dubai', reload = () => { void d.reload(); void rec.reload(); };
  const primaryJob = [...(data?.today??[]),...(data?.late??[])].find(j=>j.status==='in_progress')??[...(data?.today??[]),...(data?.late??[])].find(j=>nextStep(j.status));
  const finished = (outcome: Outcome, record: JobRecord, extra?: DoneExtra) => setDone({ outcome, record, extra });
  const rest = (data?.today ?? []).filter(j => j.id !== primaryJob?.id), late = (data?.late ?? []).filter(j => j.id !== primaryJob?.id);
  const meta = (j: Job) => j.priority === 'urgent' ? <span className="ds-meta-warn">Urgent</span> : j.status !== 'scheduled' ? statusLabels[j.status] ?? j.status : PRIORITY[j.priority] ?? null;
  return <div className="page stack my-day ds-home">
    {selection.bar}
    <header className="ds-home-head"><p className="ds-date" data-no-translate suppressHydrationWarning>{formatInLang(new Date(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }, lang)}</p><Greeting tz={tz} mode="title"/></header>
    {done && <DoneMoment outcome={done.outcome} record={done.record} extra={done.extra} onClose={() => setDone(null)} />}
    {d.loading ? <Skeleton className="skeleton-card ds-hero-skeleton" /> : d.error || !data ? <ErrorState retry={d.reload} /> : <>
      {primaryJob ? <NextJobHero key={primaryJob.id} j={primaryJob} tz={tz} base={base} lang={lang} onDone={reload} onFinished={finished} when={primaryJob.scheduled_for ? <span data-no-translate className="num">{time(primaryJob.scheduled_for, tz, lang)}</span> : <><span>Due</span> <span data-no-translate>{day(primaryJob.due_on, tz, lang)}</span></>} />
        : <section className="ds-hero ds-hero-empty stack compact"><h2>{data.done ? 'All done for today' : 'No jobs today'}</h2><p className="ds-muted">{data.next[0] ? `Next: ${data.next[0].title}, ${day(data.next[0].scheduled_for, tz, 'en')}.` : 'When the office gives you a job, it shows here.'}</p><Link className="ds-hero-btn" href="/work-orders">View jobs</Link></section>}
      {late.length > 0 && <section id="late" className="stack compact ds-section"><div className="ds-section-head"><h2>Late</h2><span className="ds-count num">{late.length}</span></div><ul className="ds-rows">{late.map(j => <JobRow key={j.id} j={j} selection={selection} when={<span data-no-translate>{day(j.due_on, tz, lang)}</span>} meta={<span className="ds-meta-warn">Late</span>} />)}</ul></section>}
      {rest.length > 0 && <section id="today" className="stack compact ds-section"><div className="ds-section-head"><h2>Later today</h2><span className="ds-count num">{rest.length} <span>jobs</span></span></div><ul className="ds-rows">{rest.map(j => <JobRow key={j.id} j={j} selection={selection} when={<span data-no-translate>{time(j.scheduled_for, tz, lang)}</span>} meta={meta(j)} />)}</ul></section>}
      {data.next.length > 0 && <section className="stack compact ds-section"><div className="ds-section-head"><h2>Next days</h2></div><ul className="ds-rows">{data.next.map(j => <JobRow key={j.id} j={j} selection={selection} when={<span data-no-translate className="ds-when-2"><span>{day(j.scheduled_for, tz, lang)}</span><span>{time(j.scheduled_for, tz, lang)}</span></span>} meta={meta(j)} />)}</ul></section>}
      <p className="small"><Link href="/work-orders">All my jobs</Link></p>
    </>}
    <section className="stack compact ds-section ds-more" aria-labelledby="ds-more-h"><div className="ds-section-head"><h2 id="ds-more-h">More</h2>{rec.data && <span className="ds-count job-count">Jobs done: {rec.data.month} this month, {rec.data.total} in total</span>}</div>
      <Greeting tz={tz} mode="ask"/>
      {member?.workspace_id&&<MyAgentQuestions base={base}/>}
      {member?.role === 'technician' && <HabitCard base={base} />}
      {member?.role === 'technician' && <AgentCard />}
      <div className="ds-more-links"><Link className="button secondary" href="/suggestions/new">Suggest a job</Link>{member?.role==='technician'&&<Link className="button secondary" href="/my-record">My record</Link>}</div>
      {member && <div className="row"><RequestTimeOff base={`/api/workspaces/${member.workspace_id}`} /></div>}
      {member && <LeaveRequests base={`/api/workspaces/${member.workspace_id}`} self={me.user.id} />}
    </section>
  </div>;
}
