import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activitySentence, auditDiff } from '../lib/ui/polish';
import { notificationMessage } from '../lib/ui/notifications';
import { explicitClientComment, storedCommentVisibility, saveCommentVisibility } from '../lib/ui/comments';
import { staffEvent } from '../lib/ui/work-orders';
import { Supplier } from '../components/app/supplier';
import { WorkOrderDetail } from '../components/app/work-order-detail';
import InviteAccept from '../app/(app)/invites/accept/page';
import { Audit, auditDateBoundary } from '../components/app/audit';
import { PublicHeader } from '../components/public/chrome';
const mocks=vi.hoisted(()=>({query:'',demo:false,resource:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()}),usePathname:()=>'/audit',useSearchParams:()=>new URLSearchParams(mocks.query)}));
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>mocks.resource(url)}));
vi.mock('../components/ui/toast',()=>({useToast:()=>vi.fn()}));
vi.mock('../components/app/context',async importOriginal=>({...await importOriginal<object>(),useApp:()=>({member:{role:'admin',workspace_id:'workspace'},workspace:{id:'workspace',name:'Groundwork',is_demo:mocks.demo,timezone:'Asia/Dubai'},me:{user:{id:'imran',name:'Imran'},memberships:[]}})}));
afterEach(()=>{mocks.query='';mocks.demo=false;mocks.resource.mockReset();});
describe('comment privacy',()=>{
 it('starts internal, persists either choice per user, and safely handles unavailable storage',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  expect(storedCommentVisibility(storage,'imran')).toBe('internal');saveCommentVisibility(storage,'imran','client');expect(storedCommentVisibility(storage,'imran')).toBe('client');expect(storedCommentVisibility(storage,'sam')).toBe('internal');saveCommentVisibility(storage,'imran','internal');expect(storedCommentVisibility(storage,'imran')).toBe('internal');
  expect(storedCommentVisibility({getItem:()=>{throw Error();}},'imran')).toBe('internal');
 });
 it('requires explicit client visibility in assistant requests',()=>{
  for(const text of [`add a comment 'This must be a client-visible comment'`, `comment "Make this visible to the client"`, 'add a comment','comment technician confirmed','add a note','do not share this with the client',"don't send a client-visible comment"])expect(explicitClientComment(text)).toBe(false);
  for(const text of ['Add a client-visible comment','Share this comment with the client','Make this visible to the client'])expect(explicitClientComment(text)).toBe(true);
 });
 it('renders both badges and an internal composer, with assistant attribution on activity',()=>{
  mocks.resource.mockImplementation(url=>({loading:false,error:false,reload:vi.fn(),data:url?.includes('/work-orders/')?{id:'order',order_number:1,title:'Current title',status:'open',priority:'normal',description:'',client:{name:'Client'},site:{name:'Site',address:''},comments:[{id:'internal',body:'Private',visibility:'internal',author_id:'imran',created_at:'2026-10-11T10:00:00Z',work_order_title:'Original title',actor_kind:'assistant'},{id:'client',body:'Shared',visibility:'client',author_id:'imran',created_at:'2026-10-11T11:00:00Z',work_order_title:'Original title'}],timeline:[]}:url?.endsWith('/members')?[]:{data:[]}}));
  const html=renderToStaticMarkup(<WorkOrderDetail id="order"/>);
  expect(html).toContain('Visible to the client');expect(html).toContain('Internal note');expect(html).toContain('Add internal note');expect(html).toContain('via assistant');expect(html).toContain('to Original title');
 });
});
describe('history and local formatting',()=>{
 it('uses stored titles, names key actions, internal notes and approval decisions',()=>{
  expect(activitySentence({actor_name:'Sam',entity:'comments',action:'insert',work_order_title:'Original title',after:{visibility:'internal'}})).toBe('Sam created an internal note on Original title');
  expect(activitySentence({actor_name:'Imran',entity:'api_tokens',action:'insert',after:{name:'QA read key'}})).toBe("Imran created agent key 'QA read key'");
  expect(activitySentence({actor_name:'Imran',entity:'import_rows',action:'update',after:{row_number:4,filename:'sample-work-orders.csv',decision:'approved',work_order_number:61}})).toBe('Imran approved row 4 of sample-work-orders.csv → WO-61');
  expect(staffEvent({id:'event',kind:'status_changed',created_at:'',actor_id:null,work_order_title:'Original title',details:{from_status:'scheduled',to_status:'in_progress'}})).toBe('moved Original title from Scheduled to In Progress');
 });
 it('formats notification changes using captured context after a title rename',()=>{
  expect(notificationMessage({kind:'status_changed',actor_name:'Sam',work_order_title:'Original title',current_title:'Renamed',from_status:'scheduled',to_status:'in_progress'})).toBe('Sam moved Original title from Scheduled to In Progress.');
  expect(notificationMessage({kind:'comment_added',actor_name:'Sam',work_order_title:'Repair tap'})).toBe('Sam added a comment visible to the client to Repair tap.');
 });
 it('drops visually unchanged fields and formats timestamps in the workspace timezone',()=>{
  expect(auditDiff({body:null},{body:''})).toEqual([]);
  const change=auditDiff({expires_at:null},{expires_at:'2026-11-12T20:30:00Z'},'Asia/Dubai')[0];expect(change.new).toContain('Nov 13, 2026');expect(change.new).toContain('12:30');expect(change.new).not.toContain('T20:30');
  expect(auditDateBoundary('2026-10-11','Asia/Dubai')).toBe('2026-10-10T20:00:00.000Z');expect(auditDateBoundary('2026-10-11','Asia/Dubai',true)).toBe('2026-10-11T19:59:59.999Z');
  expect(Date.parse(auditDateBoundary('2026-11-01','America/New_York',true))-Date.parse(auditDateBoundary('2026-11-01','America/New_York'))+1).toBe(25*3600000);
 });
 it('restores audit filters from the URL and gives a clear filtered empty state',()=>{
  mocks.query='action=update&entity=work_orders&from=2026-10-11';mocks.resource.mockImplementation(url=>({loading:false,error:false,data:url?.endsWith('/members')?[]:{data:[],total:0}}));
  const html=renderToStaticMarkup(<Audit/>);expect(html).toContain('No entries match these filters');expect(html).toContain('Oct 11, 2026');expect(html).toContain('Clear filters');expect(mocks.resource.mock.calls[0][0]).toContain('from=2026-10-10T20%3A00%3A00.000Z');
 });
 it('gives real accounts the supplier connection state and session-aware public navigation',()=>{
  mocks.resource.mockReturnValue({loading:false,error:false,data:null});const html=renderToStaticMarkup(<Supplier/>);expect(html).toContain('Connect a supplier');expect(html).not.toContain('Cobalt');expect(html).not.toContain('Repair all');expect(mocks.resource.mock.calls.every(([url])=>url===null)).toBe(true);
  const header=renderToStaticMarkup(<PublicHeader signedIn/>);expect(header).toContain('Go to dashboard');expect(header).not.toContain('>Sign in<');expect(header).not.toContain('Try the demo');
 });
});

it('never offers invite acceptance before validating a bogus token',()=>{mocks.query='token=bogus';const html=renderToStaticMarkup(<InviteAccept/>);expect(html).not.toContain('Join a workspace');expect(html).not.toContain('>Accept invite<');});

describe('static public header', () => {
  it('renders both states without animation when the session is not known yet', async () => {
    const { PublicHeader } = await import('../components/public/chrome');
    const html = renderToStaticMarkup(<PublicHeader />);
    expect(html).toContain('data-variant="out"'); expect(html).toContain('data-variant="in"');
    expect(html).toContain('Try the demo'); expect(html).toContain('Go to dashboard');
  });
});

describe('session hint before paint', () => {
  it('shows signed out on a first visit and keeps a remembered signed in state', async () => {
    const { sessionHintScript } = await import('../lib/head-scripts');
    const run = (stored: string | null, throws = false) => {
      const documentElement = { dataset: {} as Record<string, string> };
      const localStorage = { getItem: () => { if (throws) throw new Error('blocked'); return stored; } };
      new Function('document', 'localStorage', sessionHintScript)({ documentElement }, localStorage);
      return documentElement.dataset.session;
    };
    expect(run(null)).toBe('out'); expect(run('in')).toBe('in'); expect(run('out')).toBe('out'); expect(run('junk')).toBe('out'); expect(run(null, true)).toBe('out');
  });
});
