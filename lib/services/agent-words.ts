import { z } from 'zod';
import { inWorkspace, row, uuid } from './shared';
import { ApiError } from '../http';
export const wordInput=z.object({phrase:z.string().trim().min(1).max(60),means_kind:z.enum(['site','asset','other']),means_id:uuid.nullish(),means_text:z.string().trim().min(1).max(200).optional(),scope:z.enum(['company','personal'])}).strict();
export type AgentWord={id:string;phrase:string;means_kind:'site'|'asset'|'other';means_id:string|null;means_text:string;user_id:string|null};
export type Words={company:AgentWord[];personal:AgentWord[]};
export async function listWords(user:string,ws:string):Promise<Words>{return inWorkspace(user,ws,async c=>{
 const words=(await c.db.query<AgentWord>('SELECT * FROM agent_words WHERE workspace_id=$1 ORDER BY lower(phrase),id',[ws])).rows;
 return {company:words.filter(w=>w.user_id===null),personal:words.filter(w=>w.user_id===user)};
});}
export async function saveWord(user:string,ws:string,body:unknown){const d=wordInput.parse(body);return inWorkspace(user,ws,async c=>{
 if(d.scope==='company'&&c.role!=='admin')throw new ApiError(403,'forbidden','Only an admin can add company words.');
 const owner=d.scope==='personal'?user:null;
 // Serialize the count and insert for this person's or company's words.
 await c.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([ws,owner,'words'])]);
 if((await c.db.query('SELECT id FROM agent_words WHERE workspace_id=$1 AND user_id IS NOT DISTINCT FROM $2::uuid AND lower(phrase)=lower($3)',[ws,owner,d.phrase])).rowCount)throw new ApiError(409,'conflict','You already use that word.');
 const n=Number((await c.db.query('SELECT count(*) FROM agent_words WHERE workspace_id=$1 AND user_id IS NOT DISTINCT FROM $2::uuid',[ws,owner])).rows[0].count);
 if(n>=(owner?100:200))throw new ApiError(422,'limit','Remove a word before adding another.');
 let meaning=d.means_text;
 if(d.means_kind!=='other'){
  if(!d.means_id)throw new ApiError(422,'invalid','Choose a site or asset.');
  meaning=(await row(c,d.means_kind==='site'?'sites':'assets',d.means_id)).name;
 }else if(!meaning)throw new ApiError(422,'invalid','Tell us what this word means.');
 return (await c.db.query('INSERT INTO agent_words(workspace_id,user_id,phrase,means_kind,means_id,means_text,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[ws,owner,d.phrase,d.means_kind,d.means_kind==='other'?null:d.means_id,meaning,user])).rows[0];
});}
export async function deleteWord(user:string,ws:string,id:string){uuid.parse(id);return inWorkspace(user,ws,async c=>{
 const result=await c.db.query('DELETE FROM agent_words WHERE workspace_id=$1 AND id=$2 RETURNING id',[ws,id]);
 if(!result.rowCount)throw new ApiError(404,'not_found','That word is gone.');
 return {deleted:true};
});}
/** One pass keeps overlapping phrases and meanings from being expanded twice. Unicode boundaries support every script. */
export function resolveWords(text:string,words:Words):string{
 const known=new Map<string,AgentWord>();
 for(const w of [...words.company,...words.personal])known.set(w.phrase.toLowerCase(),w);
 const entries=[...known.values()].sort((a,b)=>b.phrase.length-a.phrase.length);
 if(!entries.length)return text;
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const re=new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])(?:${entries.map(w=>escape(w.phrase)).join('|')})(?![\\p{L}\\p{N}\\p{M}_])`,'giu');
 return text.replace(re,phrase=>{const word=known.get(phrase.toLowerCase())??entries.find(w=>new RegExp(`^${escape(w.phrase)}$`,'iu').test(phrase))!;return `${phrase} (${word.means_text})`;});
}
