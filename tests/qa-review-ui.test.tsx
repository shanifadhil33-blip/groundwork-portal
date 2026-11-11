import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect,it,vi } from 'vitest';
import { AppContext, type Membership } from '../components/app/context';
import { Clients,ClientDetail,Team } from '../components/app/clients';
import { SettingsInvites } from '../components/app/settings-invites';
import { AgentAccess } from '../components/app/agent-access';
import { ApprovalQueue } from '../components/app/approval-queue';
import { ImportPagination } from '../components/app/import-shared';
import { NoAccess } from '../components/app/no-access';
import { timezoneOptions } from '../lib/ui/timezones';
import { nextQueueRow,suggestionEdits } from '../lib/ui/queue';
import { plural } from '../lib/ui/polish';
import { parseListQuery } from '../lib/pagination';
import { parseFile } from '../lib/import/parse';
import type { ImportRow } from '../lib/ui/imports';
const state=vi.hoisted(()=>({resources:{} as Record<string,unknown>}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:()=>{},replace:()=>{}})}));
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>({data:url?state.resources[url]??null:null,loading:false,error:null,reload:()=>{},setData:()=>{}})}));
const base='/api/workspaces/workspace',member:Membership={workspace_id:'workspace',workspace_name:'Ridgeline',role:'admin',client_id:null,client_name:null};
function render(element:React.ReactNode,role:Membership['role']='admin') {return renderToStaticMarkup(<AppContext.Provider value={{member:{...member,role},workspace:{id:'workspace',name:'Ridgeline',is_demo:false,timezone:'Asia/Dubai',country:'AE',region:null,currency:'AED'},me:{user:{id:'user',name:'Imran',email:'imran@example.test',image:null},memberships:[member]},reload:()=>{},updateName:()=>{}}}>{element}</AppContext.Provider>);}
it('offers searchable IANA options with workspace fallback only for personal preferences',()=>{
 const options=timezoneOptions('Asia/Dubai');expect(options.length).toBeGreaterThan(300);expect(options).toContainEqual({value:'Asia/Dubai',label:'Asia/Dubai',noTranslate:true});expect(options).toContainEqual({value:'UTC',label:'UTC',noTranslate:true});expect(timezoneOptions('',true)[0]).toEqual({value:'',label:'Use the company time zone'});
 for(const {value} of options)expect(()=>new Intl.DateTimeFormat('en',{timeZone:value})).not.toThrow();

});
it('renders clients without team management and names each site menu',()=>{
 state.resources={[base+'/clients']:[{id:'harbor',name:'Harbor & Pine'}],[base+'/members']:[{user_id:'sam',name:'Sam',role:'staff',email:'sam@example.test',client_id:null}],[base+'/clients/harbor']:{id:'harbor',name:'Harbor & Pine'},[base+'/clients/harbor/sites']:[{id:'marina',name:'Marina Exchange',address:'12 Road',client_id:'harbor'}],[base+'/invites']:[]};
 expect(render(<Clients/>)).not.toContain('Team members');expect(render(<ClientDetail id="harbor"/>)).toContain('aria-label="More for Marina Exchange"');
});
it('renders one invite creation button, labeled role, title-case invite states and a focus action',()=>{
 state.resources={[base+'/invites']:[],[base+'/clients']:[]};
 const empty=render(<SettingsInvites base={base} demo={false}/>);expect(empty.match(/>Create invite</g)).toHaveLength(1);expect(empty).toContain('Enter an email');expect(empty).toContain('for="invite-role">Role');expect(empty).toContain('Supervisor');expect(empty).toContain('It expires in seven days.');expect(empty).not.toContain('No email');
 state.resources[base+'/invites']=[{id:'invite',email:'pranav@example.test',role:'client',status:'revoked',expires_at:'2026-10-15T00:00:00Z',client_id:'harbor'}];
 const revoked=render(<SettingsInvites base={base} demo={false}/>);expect(revoked).toContain('Client manager');expect(revoked).toContain('Revoked');expect(revoked).not.toContain('>Revoke</');expect(revoked).not.toContain('Copy invite');
});
it('shows a disabled last-admin removal control with its reason and labeled role',()=>{
 state.resources={[base+'/members']:[{user_id:'imran',name:'Imran',role:'admin',email:'imran@example.test',client_id:null}],[base+'/clients']:[]};
 const html=render(<Team base={base}/>);expect(html).toContain('Keep at least one workspace admin.');expect(html).toMatch(/button[^>]*disabled=""[^>]*class="button secondary[^>]*>[\s\S]*?Remove member/);expect(html).toContain('for="member-role-imran"');expect(html).toContain('Admin');
});
it('shows revocation date instead of key expiry',()=>{
 state.resources={[base+'/tokens?all=true']:[{id:'key',name:'Read key',scope:'read',created_at:'2026-10-01T00:00:00Z',last_used_at:null,expires_at:'2026-10-31T00:00:00Z',revoked_at:'2026-10-11T00:00:00Z'}]};
 const html=render(<AgentAccess base={base} admin demo={false}/>);expect(html).toContain('Revoked on');expect(html).not.toContain('Oct 31');
});
it('shows a single empty queue state and no bulk hint or one-page pager',()=>{
 state.resources={[base+'/queue?page=1']:{data:[],total:0,page:1,pageSize:50},[base+'/imports']:[],[base+'/clients']:[]};
 const html=render(<ApprovalQueue/>);expect(html.match(/class="empty-state"/g)).toHaveLength(1);expect(html).not.toContain('Select rows to approve');expect(html).not.toContain('Choose a row');expect(html).not.toContain('Previous');
 expect(renderToStaticMarkup(<ImportPagination page={1} total={1} pageSize={50} onChange={()=>{}}/>)).toBe('');expect(renderToStaticMarkup(<ImportPagination page={1} total={51} pageSize={50} onChange={()=>{}}/>)).toContain('Next');
});
it('gives clients exactly two aligned recovery actions with their home destination',()=>{
 const html=render(<NoAccess/>,'client');expect(html).toContain('This page is for your maintenance company’s team.');expect(html).toContain('row error-actions');expect(html).toContain('Go back');expect(html).toContain('href="/home"');expect(html).toContain('Go to Home');expect(html).not.toContain('/dashboard');expect(html).not.toContain('Back to home');
});
it('advances by queue order and keeps the suggestion separate until applied',()=>{
 const row=(id:string,n:number):ImportRow=>({id,import_id:'import',row_number:n,data:{title:'Repair entry sensor',description:'Reader rejects cards',priority:'normal',client:'Harbor',site:'Marina',scheduled_for:'2026-11-12T20:00:00Z',due_on:'2026-11-15',external_ref:''},decision:'pending',status:'valid',warnings:[],errors:[],ai_summary:'Inspect reader alignment and wiring after intermittent access failures.',ai_priority:'high',ai_is_suggestion:true,work_order_id:null});
 const rows=[row('a',8),row('b',1),row('c',5)];expect(nextQueueRow(rows,['a'],rows[0])?.id).toBe('b');expect(nextQueueRow(rows,['c'],rows[2])?.id).toBe('a');expect(nextQueueRow(rows,['a','b','c'],rows[0])).toBeNull();
 const edits=suggestionEdits(rows[0],'Asia/Dubai');expect(edits.description).toBe(rows[0].ai_summary);expect(edits.priority).toBe('high');expect(edits.scheduled_for).toBe('2026-11-13');expect(rows[0].data.priority).toBe('normal');
});
it('uses one count helper and accepts an Unassigned filter and drops invalid assignee IDs',()=>{
 for(const term of ['work order','request','row','client','site','member','key']){expect(plural(1,term)).toBe(`1 ${term}`);expect(plural(2,term)).toBe(`2 ${term}s`);}expect(plural(1,'entry','entries')).toBe('1 entry');expect(parseListQuery(new URLSearchParams('assignee_id=unassigned')).assignee_id).toBe('unassigned');// A bad or unknown filter in a link is dropped, never an error page (bug 39).
expect(parseListQuery(new URLSearchParams('assignee_id=oops')).assignee_id).toBeUndefined();expect(parseListQuery(new URLSearchParams('status=late&status=done&tab=approve')).status).toEqual(['done']);
});
it('sample requests all have real client/site names and useful descriptions',()=>{
 const parsed=parseFile(Buffer.from(readFileSync(new URL('../data/sample-work-orders.csv',import.meta.url),'utf8')),'sample.csv');expect(parsed.rows).toHaveLength(40);
 for(const row of parsed.rows){expect(row.Client).toBe('Harbor & Pine Coworking');expect(row.Site).toBe('Marina Exchange');expect(row.Description.length).toBeGreaterThan(45);expect(row.Title).not.toMatch(/sample equipment|fictional maintenance/i);}
});
