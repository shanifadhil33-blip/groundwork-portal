'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from './context';
import { useResource } from './resource';
import { useUiLang } from './use-ui-lang';
import { NoAccess } from './no-access';
import { PageHeader } from '../ui/layout';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../ui';
import { Dropdown } from '../ui/dropdown';
import { fixesLine } from '../../lib/count-lines';
import { tradeLabels, type Trade } from '../../lib/trades';
import { formatInLang } from '../../lib/date-lang';
import type { myFixes } from '../../lib/services/job-report';
type RecordData = Awaited<ReturnType<typeof myFixes>>;
export function MyRecord() {
 const { member } = useApp(), lang = useUiLang();
 const [month, setMonth] = useState('this'), [q, setQ] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1);
 // Search waits for a short pause in typing so the list does not flash on every key.
 useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);
 const allowed = member?.role === 'technician';
 const result = useResource<RecordData>(allowed ? `/api/workspaces/${member.workspace_id}/my-fixes?${new URLSearchParams({month,q:search,page:String(page)})}` : null);
 if (!allowed) return <NoAccess />;
 return <div className="page stack my-record">
  <PageHeader><h1>My record</h1></PageHeader>
  {result.data && <section className="stack compact" aria-live="polite"><p data-no-translate>{fixesLine(lang,result.data.summary)}</p><p>Thanks from clients:{' '}<span data-no-translate>{result.data.summary.thanks ?? 0}</span></p><div className="row" style={{flexWrap:'wrap'}}>{result.data.summary.trades.map(t=><Badge key={t.trade}><span>{tradeLabels[t.trade as Trade] ?? t.trade}</span> {t.count}</Badge>)}</div></section>}
  <label className="form-field"><span>Search my fixes</span><input type="search" value={q} maxLength={200} onChange={e=>{setQ(e.target.value);setPage(1);}} /></label>
  <div className="form-field"><label htmlFor="my-record-month">Month</label><Dropdown id="my-record-month" label="Month" value={month} onChange={v=>{setMonth(v);setPage(1);}} options={[{value:'this',label:'This month'},{value:'last',label:'Last month'},{value:'all',label:'All'}]}/></div>
  {result.loading && !result.data ? <div role="status" aria-label="Loading"><Skeleton className="card" /><Skeleton className="card" /></div> : result.error ? <ErrorState retry={()=>void result.reload()} /> : result.data && <>
   {result.data.data.length ? <ul className="stack" style={{listStyle:'none',padding:0,margin:0}}>{result.data.data.map(j=><li key={j.id}><Link href={`/work-orders/${j.id}`} className="card stack compact record-card">
    <strong><bdi data-no-translate>#{j.order_number}</bdi> <span data-no-translate>{j.title}</span></strong><span data-no-translate>{j.site_name}</span>
    <span data-no-translate>{formatInLang(new Date(`${j.done_date}T00:00:00Z`),{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'},lang)}</span>
    <div><Badge>{j.outcome_label}</Badge></div>
    {j.problem&&<p className="record-line"><span>Problem</span>: <span data-no-translate>{j.problem}</span></p>}{j.fix&&<p className="record-line"><span>Fix</span>: <span data-no-translate>{j.fix}</span></p>}
   </Link></li>)}</ul> : <EmptyState title="No fixes found. Try another month or search." />}
   <div className="row" style={{flexWrap:'wrap'}}>{page>1&&<Button variant="secondary" onClick={()=>setPage(page-1)}>Previous</Button>}{page*result.data.pageSize<result.data.total&&<Button variant="secondary" onClick={()=>setPage(page+1)}>Next</Button>}</div>
  </>}

 </div>;
}
