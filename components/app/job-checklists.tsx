'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, ConfirmDialog, Dropdown, ErrorState, Skeleton } from '../ui';
import { request, RequestError } from '../../lib/ui/api';
import { CHECKLIST_DEFAULTS, type JobChecklist } from '../../lib/job-checklists';
import { TRADES, tradeLabels, type Trade } from '../../lib/trades';
import { useResource } from './resource';

export function ChecklistSettings({ base }: { base: string }) {
  const data = useResource<Record<string,string[]>>(`${base}/checklists`);
  const [trade,setTrade] = useState<Trade>('ac'), [steps,setSteps] = useState<string[]>([]);
  const [nextTrade,setNextTrade] = useState<Trade|null>(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [saved,setSaved] = useState(false);
  useEffect(() => {setSteps(data.data?.[trade] ?? []); setError('');}, [trade,data.data]);
  async function save() {
    setBusy(true);setError('');setSaved(false);
    try {await request(`${base}/checklists`,{method:'PUT',body:JSON.stringify({trade,steps})});data.setData({...data.data,[trade]:steps.map(s=>s.trim())});setSaved(true);}
    catch(e){setError(e instanceof RequestError ? e.message : 'That did not save. Try again.');} finally{setBusy(false);}
  }
  function change(next:string[]){setSteps(next);setSaved(false);}
  function move(index:number,to:number){const next=[...steps];[next[index],next[to]]=[next[to],next[index]];change(next);}
  if(data.loading)return <Skeleton className="skeleton-card"/>;
  if(data.error)return <ErrorState error={data.error} retry={data.reload}/>;
  return <section className="stack checklist-settings"><h2>Checklists</h2>
    <Dropdown label="Job type" value={trade} options={TRADES.map(t=>({value:t,label:tradeLabels[t]}))} disabled={busy} onChange={v=>{if(steps.join('\n')!==(data.data?.[trade]??[]).join('\n')){setNextTrade(v as Trade);return;}setSaved(false);setTrade(v as Trade);}}/>
    <p className="small muted">Use up to twelve short steps. Saved jobs keep their steps.</p>
    <fieldset disabled={busy} className="stack checklist-fields">
      {steps.map((step,i)=><div className="stack compact" key={i}><label className="field"><span>Step</span><input maxLength={80} required value={step} onChange={e=>change(steps.map((s,n)=>n===i?e.target.value:s))}/></label><div className="row wrap"><Button variant="secondary" disabled={i===0} onClick={()=>move(i,i-1)}>Move up</Button><Button variant="secondary" disabled={i===steps.length-1} onClick={()=>move(i,i+1)}>Move down</Button><Button variant="ghost" onClick={()=>change(steps.filter((_,n)=>n!==i))}>Remove</Button></div></div>)}
      <div className="row wrap"><Button variant="secondary" disabled={steps.length>=12} onClick={()=>change([...steps,''])}>Add step</Button>{CHECKLIST_DEFAULTS[trade]&&<Button variant="secondary" onClick={()=>change([...(CHECKLIST_DEFAULTS[trade]??[])])}>Use suggested steps</Button>}</div>
    </fieldset>
    {error&&<p role="alert">{error}</p>}{saved&&<p role="status">Saved</p>}
    <Button busy={busy} disabled={steps.some(s=>!s.trim())} onClick={()=>void save()}>Save checklist</Button>
    <ConfirmDialog open={nextTrade!==null} title="Discard unsaved changes?" confirmLabel="Discard" onClose={()=>setNextTrade(null)} onConfirm={()=>{if(nextTrade)setTrade(nextTrade);setNextTrade(null);setSaved(false);}}>Your unsaved changes will be lost.</ConfirmDialog>
  </section>;
}

export function JobChecklistCard({ base, id, readOnly=false }: {base:string;id:string;readOnly?:boolean}) {
  const result = useResource<JobChecklist & {editable:boolean}>(`${base}/work-orders/${id}/checklist`);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const pending=useRef<{body:string;key:string}|null>(null);
  const [name,setName]=useState(''),[quantity,setQuantity]=useState('1'),[note,setNote]=useState('');
  async function save(body:unknown) {
    if(busy)return false;setBusy(true);setError('');setSaved(false);
    try {const serialized=JSON.stringify(body);if(pending.current?.body!==serialized)pending.current={body:serialized,key:crypto.randomUUID()};const next=await request<JobChecklist & {editable:boolean}>(`${base}/work-orders/${id}/checklist`,{method:'POST',headers:{'Idempotency-Key':pending.current.key},body:serialized});result.setData(next);pending.current=null;setSaved(true);return true;}
    catch(e){setError(e instanceof RequestError?e.message:'That did not save. Try again.');return false;}finally{setBusy(false);}
  }
  if(result.loading)return <Skeleton className="skeleton-card"/>;
  if(result.error)return <ErrorState error={result.error} retry={result.reload}/>;
  const data=result.data;if(!data)return null;const editable=data.editable&&!readOnly;
  return <Card className="stack job-checklist"><h2>Checklist</h2>
    <p><span>{data.steps.filter(s=>s.done).length}</span>{' '}<span>of</span>{' '}<span>{data.steps.length}</span>{' '}<span>steps done</span></p>
    {!data.steps.length&&<p className="small muted">No steps set for this job type.</p>}
    {data.steps.map(step=><label key={step.name} className="precheck-item"><input type="checkbox" checked={step.done} disabled={!editable||busy} onChange={e=>void save({action:'tick',step:step.name,done:e.target.checked})}/><span>{step.name}</span></label>)}
    <h3>Materials used</h3>{!data.materials.length&&<p className="small muted">No materials recorded.</p>}
    <ul className="stack compact checklist-materials">{data.materials.map(m=><li key={m.id}><div className="row wrap"><span data-no-translate>{m.quantity} × {m.name}</span>{editable&&<Button variant="ghost" disabled={busy} onClick={()=>void save({action:'remove_material',material_id:m.id})}>Remove</Button>}</div>{m.note&&<p data-no-translate>{m.note}</p>}</li>)}</ul>
    {editable&&data.materials.length<30&&<details className="more-panel"><summary>Add material</summary><form className="stack compact" onSubmit={async e=>{e.preventDefault();if(await save({action:'add_material',name,quantity:Number(quantity),note})){setName('');setQuantity('1');setNote('');}}}>
      <label className="field"><span>Material name</span><input required maxLength={80} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
      <label className="field"><span>Quantity</span><input type="number" required min="0.001" max="100000" step="any" value={quantity} disabled={busy} onChange={e=>setQuantity(e.target.value)}/></label>
      <label className="field"><span>Notes</span><input maxLength={200} value={note} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
      <Button variant="secondary" busy={busy} disabled={!name.trim()||!Number(quantity)} type="submit">Save material</Button>
    </form></details>}{editable&&data.materials.length>=30&&<p>Use up to thirty materials.</p>}{error&&<p role="alert">{error}</p>}{saved&&<p role="status">Saved</p>}
  </Card>;
}
