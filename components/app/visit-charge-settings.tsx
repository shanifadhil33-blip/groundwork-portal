'use client';
import { useEffect, useState } from 'react';
import { regionField } from '../../lib/countries/rules';
import { request, RequestError } from '../../lib/ui/api';
import { Button, ErrorState, Skeleton, useToast } from '../ui';
import { useApp } from './context';
import { useResource } from './resource';
type Settings = {visit_charge:number|string|null;visit_charge_regions:Record<string,number>;visit_charge_sample:boolean;currency:string;country:string};
export function VisitChargeSettings({base}:{base:string}) {
 const {member,reload}=useApp(),settings=useResource<Settings>(`${base}/settings`),toast=useToast();
 const [amount,setAmount]=useState(''),[regions,setRegions]=useState<{name:string;amount:string}[]>([]),[sample,setSample]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{if(settings.data){setAmount(settings.data.visit_charge==null?'':String(settings.data.visit_charge));setRegions(Object.entries(settings.data.visit_charge_regions??{}).map(([name,amount])=>({name,amount:String(amount)})));setSample(settings.data.visit_charge_sample);}},[settings.data]);
 if(!member?.is_owner&&member?.role!=='admin')return null;
 const choices=regionField(settings.data?.country??'AE').options;
 async function save(){
  if(busy)return;setBusy(true);setError('');setSaved(false);
  try {
   if(regions.some(r=>!r.name.trim()||!r.amount.trim())||new Set(regions.map(r=>r.name.trim())).size!==regions.length)throw new Error('Choose each region once and enter its amount.');
   await request(`${base}/settings`,{method:'PATCH',body:JSON.stringify({visit_charge:amount.trim()===''?null:Number(amount),visit_charge_regions:Object.fromEntries(regions.map(r=>[r.name.trim(),Number(r.amount)])),visit_charge_sample:sample})});
   setSaved(true);toast('Saved');await settings.reload();reload();
  }catch(e){setError(e instanceof RequestError||e instanceof Error?e.message:'We could not save this. Try again.');}finally{setBusy(false);}
 }
 return <section className="stack" style={{minWidth:0,fontSize:14}}><h2>Visit charge</h2><p>Households see this before they send a request.</p>{settings.loading?<Skeleton/>:settings.error?<ErrorState retry={settings.reload}/>:<form className="stack" onSubmit={e=>{e.preventDefault();void save();}}>
 <label className="form-field"><span>Amount</span> <span data-no-translate>({settings.data?.currency})</span><input type="number" min="0" max="100000" step="0.01" value={amount} disabled={busy} style={{minHeight:44,minWidth:0,width:'100%'}} onChange={e=>{setAmount(e.target.value);setSaved(false);}}/></label>
 <label className="queue-check" style={{minHeight:44}}><input type="checkbox" checked={sample} disabled={busy} onChange={e=>{setSample(e.target.checked);setSaved(false);}}/>Sample price</label>
 <h3>Prices by region</h3>{regions.map((r,i)=><div className="stack" key={i} style={{minWidth:0}}><label className="form-field">Region{choices?<select value={r.name} disabled={busy} style={{minHeight:44,width:'100%',minWidth:0,fontSize:14}} onChange={e=>{setRegions(all=>all.map((v,n)=>n===i?{...v,name:e.target.value}:v));setSaved(false);}}><option value="">Choose a region</option>{choices.map(c=><option key={c} value={c}>{c}</option>)}</select>:<input value={r.name} required maxLength={60} disabled={busy} style={{minHeight:44,minWidth:0}} onChange={e=>{setRegions(all=>all.map((v,n)=>n===i?{...v,name:e.target.value}:v));setSaved(false);}}/>}</label><label className="form-field"><span>Amount</span> <span data-no-translate>({settings.data?.currency})</span><input type="number" required min="0" max="100000" step="0.01" value={r.amount} disabled={busy} style={{minHeight:44,minWidth:0,width:'100%'}} onChange={e=>{setRegions(all=>all.map((v,n)=>n===i?{...v,amount:e.target.value}:v));setSaved(false);}}/></label><Button type="button" variant="secondary" disabled={busy} onClick={()=>{setRegions(all=>all.filter((_,n)=>n!==i));setSaved(false);}}>Remove</Button></div>)}
 <Button type="button" variant="secondary" disabled={busy||regions.length>=30} onClick={()=>{setRegions(all=>[...all,{name:'',amount:''}]);setSaved(false);}}>Add region</Button>{error&&<p role="alert">{error}</p>}{saved&&<p role="status">Saved</p>}<Button type="submit" busy={busy}>Save</Button>
 </form>}</section>;
}
