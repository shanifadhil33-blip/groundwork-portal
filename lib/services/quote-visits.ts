import { z } from 'zod';
import { ApiError } from '../http';
import { inWorkspace, row, uuid, type Context } from './shared';
import { visitChargeFor, type VisitCharge } from './visit-charge';
import { createSuggestion } from './suggestions';
export const quoteVisitInput=z.object({site_id:uuid,words:z.string().trim().min(1).max(2000),preferred_window:z.string().trim().max(200).optional()}).strict();
export const FULL_PRICE='The full price depends on what the technician finds.';
export async function prepareQuoteVisit(user:string,ws:string,body:unknown) {
 const data=quoteVisitInput.parse(body);
 return inWorkspace(user,ws,async c=>{
  if(c.role!=='client')throw new ApiError(403,'forbidden','Only clients can request a quote visit.');
  const site=await row(c,'sites',data.site_id);
  if(site.client_id!==c.client_id||site.archived_at)throw new ApiError(404,'not_found','Choose one of your own sites.');
  const charge=await visitChargeFor(c,site.id);
  const args={...data,visit_charge:charge};
  const id=(await c.db.query("INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why) VALUES($1,$2,'quote_visit',$3,'Quote visit',$4) RETURNING id",[ws,user,JSON.stringify(args),FULL_PRICE])).rows[0].id;
  return {available:true,pending_action:{id,tool:'quote_visit',summary:'Quote visit',why:'Nothing is sent until you tap Yes.',fields:{words:data.words,home:site.name,where:null,since:null,photos:0,visit_charge:charge},quote_visit:true}};
 });
}
export async function confirmQuoteVisit(c:Context,a:{id:string;args:any}) {
 if(c.role!=='client')throw new ApiError(403,'forbidden','Only clients can request a quote visit.');
 const {visit_charge,...input}=a.args as {visit_charge:VisitCharge};
 const data=quoteVisitInput.parse(input);
 const saved=await createSuggestion(c.user,c.ws,{site_id:data.site_id,title:'Quote visit',problem:data.words,preferred_window:data.preferred_window},undefined,a.id,undefined,false,undefined,visit_charge);
 await c.db.query("UPDATE assistant_actions SET consumed_at=now(),outcome='done',after=$2::jsonb WHERE id=$1",[a.id,JSON.stringify(saved)]);
 return {available:true,reply:'Your request was sent. The company will confirm a time.',logged:true};
}
const priceQuestion=/\b(?:how much|cost|price|charge|fee)\b|كم|سعر|تكلفة|رسوم|എത്ര|ചാർജ്|വില|எவ்வளவு|செலவ|கட்டணம்|விலை|magkano|presyo/iu;
const visitChoice=/^(?:quote visit|زيارة تسعير|விலை பார்க்க வருகை|വില അറിയാനുള്ള സന്ദർശനം|pagbisita para sa presyo)$/iu;
/** Offer a visit without making a request. A separate Yes card shows the site and current region charge. */
export async function quoteVisitFromWords(user:string,ws:string,messages:{role:string;content:string}[]) {
 const words=messages.filter(m=>m.role==='user').at(-1)?.content?.trim()??'';
 return inWorkspace(user,ws,async c=>{
  if(c.role!=='client')return null;
  const intake=(await c.db.query("SELECT * FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND tool='quote_visit_intake' AND consumed_at IS NULL AND declined_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[ws,user])).rows[0];
  const sites=(await c.db.query('SELECT id,name FROM sites WHERE workspace_id=$1 AND client_id=$2 AND archived_at IS NULL ORDER BY name,id',[ws,c.client_id])).rows;
  if(intake){
   const site=sites.find(s=>s.name.toLocaleLowerCase()===words.toLocaleLowerCase());
   if(site){await c.db.query('UPDATE assistant_actions SET consumed_at=now() WHERE id=$1',[intake.id]);return prepareQuoteVisit(user,ws,{site_id:site.id,words:intake.args.words});}
   // A different question leaves this choice behind.
   await c.db.query('UPDATE assistant_actions SET declined_at=now() WHERE id=$1',[intake.id]);
  }
  if(visitChoice.test(words)){
   if(!sites.length)return {available:true,reply:'Ask the company to add your site before sending a request.'};
   const original=messages.filter(m=>m.role==='user'&&!visitChoice.test(m.content)).at(-1)?.content??words;
   const site=sites.find(s=>original.toLocaleLowerCase().includes(s.name.toLocaleLowerCase()))??(sites.length===1?sites[0]:null);
   if(site)return prepareQuoteVisit(user,ws,{site_id:site.id,words:original.slice(0,2000)});
   await c.db.query("INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why) VALUES($1,$2,'quote_visit_intake',$3,'Quote visit','Choose a site.')",[ws,user,JSON.stringify({words:original.slice(0,2000)})]);
   return {available:true,reply:'Which site is this for?',choices:sites.map(s=>s.name)};
  }
  if(c.client_kind==='household'||!priceQuestion.test(words)||/\b(?:WO\s*\d|status|paid|invoice|waiting|approve|decline)\b|حالة|موعد|எப்போது|എപ്പോൾ/iu.test(words))return null;
  const site=sites.find(s=>words.toLocaleLowerCase().includes(s.name.toLocaleLowerCase()))??(sites.length===1?sites[0]:null);
  const charge=await visitChargeFor(c,site?.id??null);
  return {available:true,reply:charge.amount==null?'The office will confirm the price.':`The visit charge is **${charge.currency} ${charge.amount.toFixed(2)}**.\n\n${FULL_PRICE}`,choices:['Quote visit']};
 });
}
