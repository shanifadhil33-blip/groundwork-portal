'use client';
import { useEffect,useState } from 'react';
import { useApp } from './context';
import { useResource } from './resource';
import { COMPANY_ROLES,DASHBOARDS } from '../../lib/company';
import { request,RequestError } from '../../lib/ui/api';
import { Button } from '../ui';
const labels:Record<string,string>={owner:'Owner',manager:'Manager',admin:'Admin',staff:'Supervisor',office:'Office staff',technician:'Technician',overview:'Company overview',work:'Jobs',schedule:'Schedule',team:'Team',documents:'Documents',queue:'New requests',suggestions:'Suggested jobs',clients:'Clients',import:'Add from Excel',supplier:'Parts'};
export function CompanyOptions({base,admin}:{base:string;admin:boolean}){
 const {reload}=useApp(),resource=useResource<{company_size:'small'|'big';enabled_roles:string[];enabled_dashboards:string[]}>(`${base}/settings`),[size,setSize]=useState<'small'|'big'>('big'),[roles,setRoles]=useState<string[]>([...COMPANY_ROLES]),[dashboards,setDashboards]=useState<string[]>([...DASHBOARDS]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(resource.data){setSize(resource.data.company_size);setRoles(resource.data.enabled_roles);setDashboards(resource.data.enabled_dashboards);}},[resource.data]);
 async function save(){setBusy(true);setError('');try{await request(`${base}/settings`,{method:'PATCH',body:JSON.stringify({company_size:size,enabled_roles:roles,enabled_dashboards:dashboards})});await resource.reload();reload();}catch(e){setError(e instanceof RequestError?e.message:'We could not save company choices. Try again.');}finally{setBusy(false);}}
 const toggle=(list:string[],value:string)=>list.includes(value)?list.filter(x=>x!==value):[...list,value];
 return <section className="stack"><h2>Company size and screens</h2><p>A small company gives each owner Admin, Supervisor and Technician rights. You can change size later. Jobs and people stay saved.</p><form className="stack" onSubmit={e=>{e.preventDefault();void save();}}><fieldset><legend>Company size</legend>{(['small','big'] as const).map(v=><label className="choice-row" key={v}><input type="radio" checked={size===v} disabled={!admin||busy} onChange={()=>setSize(v)}/>{v==='small'?'Small company':'Big company'}</label>)}</fieldset><fieldset><legend>Roles your company uses</legend>{COMPANY_ROLES.map(r=><label className="choice-row" key={r}><input type="checkbox" checked={roles.includes(r)} disabled={!admin||busy||r==='owner'||r==='admin'} onChange={()=>setRoles(v=>toggle(v,r))}/>{labels[r]}</label>)}</fieldset><fieldset><legend>Screens your company uses</legend>{DASHBOARDS.map(r=><label className="choice-row" key={r}><input type="checkbox" checked={dashboards.includes(r)} disabled={!admin||busy} onChange={()=>setDashboards(v=>toggle(v,r))}/>{labels[r]}</label>)}</fieldset>{error&&<p role="alert">{error}</p>}{admin&&<Button type="submit" busy={busy} disabled={!dashboards.length}>Save company choices</Button>}</form></section>;
}
