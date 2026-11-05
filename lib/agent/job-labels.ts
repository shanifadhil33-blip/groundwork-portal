/**
 * AI13: tie every price to its exact job. Free models reading a list of jobs sometimes put one job's price next to another job's
 * title. Each job in a tool result carries a ready label ("Job #1, Replace lobby light fixture") and, when it has a price, a price
 * line with the job number and title in it. After the model answers, any job title it put next to the wrong WO number is
 * corrected from the same tool results, so the reply always matches the data.
 */
type Row={order_number?:unknown;title?:unknown;quote_amount?:unknown;quote_status?:unknown;quote_note?:unknown};
const money=(currency:string,v:unknown)=>`${currency} ${Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const jobLabel=(o:Row)=>`Job #${o.order_number}, ${String(o.title??'').trim()}`;
export function labelJob<T extends Row>(o:T,currency:string):T&{job:string;price?:string}{
 if(!o||typeof o!=='object'||typeof o.order_number!=='number'||typeof o.title!=='string')return o as T&{job:string};
 const priced=o.quote_amount!==null&&o.quote_amount!==undefined&&o.quote_status;
 return {...o,job:jobLabel(o),...(priced?{price:`${money(currency,o.quote_amount)} for ${jobLabel(o)} (${o.quote_status==='pending'?'waiting for the client':o.quote_status})${o.quote_note?`. Price note: ${String(o.quote_note)}`:''}`}:{})};
}
export function labelJobs(value:any,currency:string):any{
 if(Array.isArray(value))return value.map(v=>labelJob(v,currency));
 if(value&&typeof value==='object'&&Array.isArray(value.data))return {...value,data:value.data.map((v:Row)=>labelJob(v,currency))};
 return labelJob(value,currency);
}
/** Every job number and title seen in this turn's tool results. */
export function jobsSeen(results:unknown[]):Map<number,string>{
 const seen=new Map<number,string>();
 const walk=(v:any,depth:number)=>{if(!v||typeof v!=='object'||depth>5)return;if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return;}
  if(typeof v.order_number==='number'&&typeof v.title==='string'&&v.title.trim())seen.set(v.order_number,v.title.trim());
  for(const k of Object.keys(v))if(v[k]&&typeof v[k]==='object')walk(v[k],depth+1);};
 for(const r of results){const text=(r as any)?.content?.[0]?.text;if(typeof text!=='string')continue;try{walk(JSON.parse(text),0);}catch{/* not JSON */}}
 return seen;
}
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Puts the right title next to each WO number when the model used another job's title there. */
export function fixJobTitles(reply:string,seen:Map<number,string>):string{
 if(!seen.size||!/(?:WO|Job)[\s-]?#?\d/i.test(reply))return reply;
 const titles=[...new Set(seen.values())].sort((a,b)=>b.length-a.length).map(escape);
 const re=new RegExp(`((?:WO|Job)[\\s-]?#?(\\d+)(?:\\*\\*)?(?:,|:|\\s[\\u2013\\u2014-]|)\\s*(?:\\*\\*)?["“]?)(${titles.join('|')})`,'gi');
 return reply.replace(re,(all,head:string,n:string,title:string)=>{const real=seen.get(Number(n));return real&&real.toLowerCase()!==title.toLowerCase()?head+real:all;});
}
