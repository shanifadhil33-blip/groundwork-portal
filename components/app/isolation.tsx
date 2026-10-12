'use client';
import { PageHeader } from '../ui/layout';
import { plural } from '../../lib/ui/polish';
import Link from 'next/link';
import { useApp } from './context';
import { useResource } from './resource';
import { NoAccess } from './no-access';
import { Button, ErrorState, PageSkeleton, Badge } from '../ui';
type Evidence={database_role:string;role:string;client:string|null;query:string;params:string[];row_count:number;cross_workspace:{query:string;params:string[];row_count:number}};
export function Isolation() {
 const {member,workspace,me}=useApp(),allowed=!!workspace?.is_demo&&member?.role==='client';
 const evidence=useResource<Evidence>(allowed?'/api/demo/isolation-check':null);
 if(!allowed)return <NoAccess/>;
 const pranav=(me.user.email??'').startsWith('pranav.'),e=evidence.data;
 return <div className="page stack"><Link className="back-link" href="/home">← Home</Link><PageHeader><div><h1>Isolation check</h1><p className="small">Demo · {pranav?'Pranav':'Omar'}</p><p>{pranav?'Your session belongs to Harbor & Pine Coworking.':'Your session belongs to Northgate Self Storage.'}</p></div></PageHeader>{evidence.loading?<PageSkeleton/>:evidence.error?<ErrorState message="We couldn’t run the isolation check." retry={evidence.reload}/>:e&&<><section className="stack"><h2>{pranav?'Northgate query':'Northgate query · your company'}</h2><dl className="metadata"><dt>Database role</dt><dd><code>{e.database_role}</code> · application connection</dd><dt>Portal role</dt><dd>{e.role}</dd><dt>Client</dt><dd>{e.client}</dd></dl><pre className="result-code"><code>{e.query}{'\n\n'}Parameters:{'\n'}{JSON.stringify(e.params,null,2)}</code></pre><div className="row"><Badge tone={e.row_count===0?'success':'neutral'}>{plural(e.row_count,'row')} returned</Badge></div><pre className="result-code"><code>{e.row_count===0?'[]':`${plural(e.row_count,'accessible row')} (IDs omitted)`}</code></pre><p>{e.row_count===0?'Postgres row level security returned nothing because this session belongs to another client.':'Northgate is your company, so Postgres row level security allows these rows.'}</p></section>{!pranav&&<section className="stack"><h2>Another workspace</h2><pre className="result-code"><code>{e.cross_workspace.query}{'\n\n'}Parameters:{'\n'}{JSON.stringify(e.cross_workspace.params,null,2)}{'\n\n'}Rows returned: {e.cross_workspace.row_count}{'\n'}{e.cross_workspace.row_count===0?'[]':''}</code></pre><p>Postgres row level security returned nothing because this session belongs to another workspace.</p></section>}<Button variant="secondary" onClick={evidence.reload}>Run isolation check again</Button></>}</div>;
}
