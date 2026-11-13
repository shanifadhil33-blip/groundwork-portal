'use client';
import { BidiNames } from './bidi-names';
import { Comma } from './punctuation';
import { isRtl } from '../../lib/languages';
import { useNameJoin } from './use-name-join';
import { JobChecklistCard } from './job-checklists';
import { enqueue } from '../../lib/ui/outbox';
import { useLocalDraft } from '../../lib/ui/drafts';
import { useSelection } from './selection';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { AssistantComposer } from './assistant-composer';
import { greetingWord } from '../../lib/ui/greeting-word';
import { MyAgentQuestions } from './agent-questions';
import { useUiLang } from './use-ui-lang';
import type { ReactNode } from 'react';
import { formatInLang } from '../../lib/date-lang';
import { CheckCircle2, MapPin, Phone, Play } from 'lucide-react';
import { Button, Card, Dialog, EmptyState, ErrorState, Skeleton, useToast } from '../ui';
import { PageHeader } from '../ui/layout';
import { Translated } from './app-words';
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
    const queue=()=>{enqueue(me.user.id,member!.workspace_id,{id:key,url:`${base}/work-orders/${j.id}/report`,body:payload,label:`Job report for job ${j.order_number}`});clearDraft();toast('Waiting to send');onClose();};
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

/** The next job: one white card, one stage button and Call. Tapping the title opens the job. */
function NextJobCard({ j: original, base, onDone, onFinished, when }: { j: Job; base: string; onDone: () => void; onFinished: (o: Outcome, r: JobRecord, extra?: DoneExtra) => void; when: ReactNode }) {
  const { j, step, busy, confirm, setConfirm, go } = useJobStep(original, base, onDone);
  const joinNames = useNameJoin();
  const place = joinNames([j.building, j.site_name, j.area]);
  const tel = j.contact_phone ? `tel:${j.contact_phone.replace(/[^+0-9]/g, '')}` : null;
  return <Card className="next-job-card" aria-labelledby="next-job-title">
    <p className="next-job-when"><span>Next job</span>, {when}</p>
    <h2 id="next-job-title" data-no-translate><Link href={`/work-orders/${j.id}`}>{j.title}</Link></h2>
    {place && <p className="next-job-place"><MapPin aria-hidden="true" /><span data-no-translate>{place}</span></p>}
    {j.access_notes && <p className="small">{j.access_notes}</p>}
    <div className="next-job-actions">
      {step ? <Button size="lg" busy={busy} busyLabel={step.to === 'done' ? 'Saving' : 'Starting'} icon={step.to === 'done' ? <CheckCircle2 /> : <Play />} onClick={() => step.to === 'done' ? setConfirm(true) : void go()}>{step.label}</Button> : <p className="small">The office will set a time for this job.</p>}
      {tel ? <a className="button secondary lg" href={tel}><Phone aria-hidden="true" /><span>Call</span></a> : <a className="button secondary lg" href={mapUrl(j)} target="_blank" rel="noreferrer"><MapPin aria-hidden="true" /><span>Map</span></a>}
    </div>
    {confirm && <DoneDialog j={j} base={base} onClose={() => setConfirm(false)} onSaved={(o, r, extra) => { setConfirm(false); onFinished(o, r, extra); onDone(); }} />}
  </Card>;
}

/** A job row: time, title and place, meta at the end. The whole row opens the job. */
function JobRow({ j, when, meta }: { j: Job; when: ReactNode; meta?: ReactNode }) {
  return <li><Link className="list-row" href={`/work-orders/${j.id}`}>
    <span className="visit-time">{when}</span>
    <span className="list-row-main"><span className="list-row-title"><span data-no-translate>{j.title}</span></span><span className="list-row-meta" data-no-translate><BidiNames values={[j.building ?? j.site_name, j.area]}/></span></span>
    {meta && <span className="list-row-meta">{meta}</span>}
  </Link></li>;
}

/** TECH05: the full screen card after the report is saved. Counts stay under it. */
function DoneMoment({ outcome, record, extra, onClose }: { outcome: Outcome; record: JobRecord; extra?: DoneExtra; onClose: () => void }) {
  return <div className="stack">
    <FullDoneCard outcome={outcome} name={extra?.name ?? ''} problem={extra?.problem ?? ''} work={extra?.work ?? ''} before={extra?.before ?? 0} after={extra?.after ?? 0} onClose={onClose} />
    <p className="small done-count">You finished {record.month} {record.month === 1 ? 'job' : 'jobs'} this month and {record.total} in total.</p>
  </div>;
}

export function MyDay() {
  const { member, me } = useApp(), base = `/api/workspaces/${member?.workspace_id}`, d = useResource<Day>(member && member.role !== 'client' ? `${base}/my-day` : null);
  const rec = useResource<JobRecord>(member && member.role !== 'client' ? `${base}/members/${me.user.id}/record` : null);
  const [done, setDone] = useState<{ outcome: Outcome; record: JobRecord; extra?: DoneExtra } | null>(null);
  const lang = useUiLang();
  if (member?.role === 'client') return <NoAccess />;
  const data = d.data, tz = data?.timezone ?? 'Asia/Dubai', reload = () => { void d.reload(); void rec.reload(); };
  const today = [...(data?.today ?? [])].sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? ''));
  const lateJobs = [...(data?.late ?? [])].sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? ''));
  // The next job is the earliest job today that is not done (the one he is on comes first), else the oldest late job.
  // A late job is labelled with the day it became late, never with a time it does not have today (bug 46).
  const primaryJob = today.find(j => j.status === 'in_progress') ?? today.find(j => nextStep(j.status)) ?? lateJobs.find(j => j.status === 'in_progress') ?? lateJobs.find(j => nextStep(j.status));
  const primaryIsLate = !!primaryJob && !today.some(j => j.id === primaryJob.id);
  const finished = (outcome: Outcome, record: JobRecord, extra?: DoneExtra) => setDone({ outcome, record, extra });
  const rest = today.filter(j => j.id !== primaryJob?.id), late = lateJobs.filter(j => j.id !== primaryJob?.id);
  const meta = (j: Job) => j.priority === 'urgent' ? <span className="ds-meta-warn">Urgent</span> : j.status !== 'scheduled' ? statusLabels[j.status] ?? j.status : null;
  const first = (me.user.name ?? '').split(' ')[0];
  const when = primaryJob ? (primaryIsLate
    ? <><span className="late-note">Late since</span> <span data-no-translate>{day(primaryJob.due_on, tz, lang)}</span></>
    : <span data-no-translate className="num">{time(primaryJob.scheduled_for, tz, lang)}</span>) : null;
  return <Translated><div className="page my-day">
    <PageHeader><div className="page-title"><h1><span suppressHydrationWarning>{greetingWord(tz)}</span>{first && <><Comma /><bdi data-no-translate>{first}</bdi></>}</h1><p><span data-no-translate suppressHydrationWarning>{formatInLang(new Date(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }, lang)}</span>. <span>Here are your jobs today.</span></p></div></PageHeader>
    {done && <DoneMoment outcome={done.outcome} record={done.record} extra={done.extra} onClose={() => setDone(null)} />}
    {d.loading ? <Skeleton className="skeleton-card" /> : d.error || !data ? <ErrorState error={d.error} retry={d.reload} /> : <>
      {primaryJob ? <NextJobCard key={primaryJob.id} j={primaryJob} base={base} onDone={reload} onFinished={finished} when={when} />
        : <Card><EmptyState title={data.done ? 'All done for today.' : 'No jobs today.'} action={<Link className="button secondary md" href="/work-orders">See my jobs</Link>}>{data.next[0] ? <><span>Your next job is</span> <span data-no-translate>{data.next[0].title}</span>, <span data-no-translate>{day(data.next[0].scheduled_for, tz, lang)}</span>.</> : 'New jobs from the office show here.'}</EmptyState></Card>}
      {late.length > 0 && <section id="late" className="stack compact"><div className="section-title"><h2><span>Late</span><Comma /><span className="num" data-no-translate>{late.length}</span></h2>{late.length > 3 && <Link className="text-link" href="/work-orders?overdue=true">See all</Link>}</div><Card><ul className="list">{late.slice(0, 3).map(j => <JobRow key={j.id} j={j} when={<span data-no-translate>{day(j.due_on, tz, lang)}</span>} meta={<span className="ds-meta-warn">Late</span>} />)}</ul></Card></section>}
      {rest.length > 0 && <section id="today" className="stack compact"><div className="section-title"><h2>Later today</h2></div><Card><ul className="list">{rest.map(j => <JobRow key={j.id} j={j} when={<span data-no-translate>{time(j.scheduled_for, tz, lang)}</span>} meta={meta(j)} />)}</ul></Card></section>}
    </>}
  </div></Translated>;
}
