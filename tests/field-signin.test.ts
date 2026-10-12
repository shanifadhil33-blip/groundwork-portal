import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setAuthResolverForTests } from '../lib/auth';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import * as addRoute from '../app/api/workspaces/[ws]/field-workers/route';
import * as linkRoute from '../app/api/workspaces/[ws]/field-workers/[userId]/link/route';
import * as redeemRoute from '../app/api/field-signin/route';
import type { RouteContext } from '../lib/api';
import { shareText } from '../components/app/field-workers';
type Handler=(req:Request,ctx?:RouteContext)=>Promise<Response>;
let user:string|null=ids.imran;const made:string[]=[];
beforeEach(()=>{user=ids.imran;setAuthResolverForTests(async()=>user);});
afterAll(async()=>{setAuthResolverForTests();await withSystem(async db=>{await db.query('DELETE FROM login_attempts');await db.query('DELETE FROM sessions WHERE "userId"=ANY($1::uuid[])',[made]);await db.query('DELETE FROM members WHERE user_id=ANY($1::uuid[])',[made]);await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[made]);});await closePools();});
async function call(handler:Handler,body?:unknown,params:Record<string,string>={}){
 const r=await handler(new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve({ws:ids.ridgeline,...params})});
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')??''};
}
const add=async(body:unknown)=>{const r=await call(addRoute.POST,body);if(r.body.user_id)made.push(r.body.user_id);return r;};
const clearTries=()=>withSystem(db=>db.query('DELETE FROM login_attempts'));

describe('field staff sign in by link or code', () => {
 it('an admin adds a technician and gets a link and a 6 number code, nothing is sent', async () => {
  const r=await add({name:'Karim',phone:'+971 50 000 0000'});
  expect(r.status).toBe(201);expect(r.body.code).toMatch(/^\d{6}$/);expect(r.body.token.length).toBeGreaterThan(20);expect(r.body.role).toBe('technician');
  const m=await withSystem(async db=>(await db.query('SELECT role FROM members WHERE user_id=$1 AND workspace_id=$2',[r.body.user_id,ids.ridgeline])).rows[0]);
  expect(m.role).toBe('technician');
 });
 it('the code signs him in once, then it is used up', async () => {
  await clearTries();const r=await add({name:'Nabil'});
  const ok=await call(redeemRoute.POST,{code:r.body.code.slice(0,3)+' '+r.body.code.slice(3)});
  expect(ok.status).toBe(200);expect(ok.body.home).toBe('/work-orders');expect(ok.cookie).toMatch(/authjs\.session-token=/);
  expect((await call(redeemRoute.POST,{code:r.body.code})).status).toBe(400);
 });
 it('the link signs him in, and a new link stops the old one', async () => {
  await clearTries();const r=await add({name:'Joseph'});
  const fresh=await call(linkRoute.POST,undefined,{userId:r.body.user_id});expect(fresh.status).toBe(201);
  expect((await call(redeemRoute.POST,{token:r.body.token})).status).toBe(400);
  expect((await call(redeemRoute.POST,{token:fresh.body.token})).status).toBe(200);
 });
 it('a supervisor can add technicians but not supervisors, and nobody gets a link for an admin or a client', async () => {
  user=ids.sam;
  expect((await add({name:'Tariq',role:'staff'})).status).toBe(403);
  expect((await add({name:'Tariq'})).status).toBe(201);
  user=ids.imran;
  expect((await call(linkRoute.POST,undefined,{userId:ids.imran})).status).toBe(403);
  expect((await call(linkRoute.POST,undefined,{userId:ids.pranav})).status).toBe(403);
 });
 it('technicians and clients cannot add anyone', async () => {
  user=ids.ravi;expect((await add({name:'X'})).status).toBe(403);
  user=ids.pranav;expect((await add({name:'X'})).status).toBe(403);
 });
 it('stops guessing after 10 tries from one place', async () => {
  await clearTries();
  for(let i=0;i<10;i++)await call(redeemRoute.POST,{code:'000000'});
  const r=await call(redeemRoute.POST,{code:'000000'});expect(r.status).toBe(429);expect(r.body.error.message).toBe('Too many tries. Please wait 15 minutes.');
  await clearTries();
 });
 it('the WhatsApp message is short and plain', () => {
  expect(shareText({name:'Karim',token:'abc',code:'123456'},'https://x.app')).toBe('Hi Karim, this is your Groundwork sign in.\nTap: https://x.app/join/abc\nOr open https://x.app/join and type 123 456\nIt works once and ends in 7 days.');
 });
});
import { readFileSync } from 'node:fs';
describe('people without an email (field workers)', () => {
 it('the app shell never assumes an email', () => {
  for (const f of ['components/app/shell.tsx','components/app/isolation.tsx']) expect(readFileSync(new URL('../'+f, import.meta.url),'utf8')).not.toMatch(/user\.email\.(split|startsWith)/);
  expect(readFileSync(new URL('../components/app/context.tsx', import.meta.url),'utf8')).toContain('email: string | null;');
 });
});
