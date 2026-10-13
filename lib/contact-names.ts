export type Contact = {user_id:string;real_name:string;nickname:string|null;name:string;role?:string;staff_kind?:string|null;client_kind?:string|null};
/** Names are substituted only in identity fields. Message bodies and company names stay verbatim. */
export function personalNames<T>(value:T,contacts:Contact[]):T {
 const byId=new Map(contacts.map(p=>[p.user_id,p]));
 const visit=(v:unknown):unknown=>{
  if(Array.isArray(v))return v.map(visit);
  if(!v||typeof v!=='object'||v instanceof Date)return v;
  const out:Record<string,unknown>=Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)]));
  if(typeof out.id==='string'&&'name' in out&&!('workspace_id' in out)){const p=byId.get(out.id);if(p){out.name=p.name;out.real_name=p.real_name;}}
  for(const [idKey,nameKey] of [['user_id','name'],['sender_id','sender_name'],['sender_user_id','sender_name'],['author_id','author_name'],['actor_id','actor_name'],['assignee_id','assignee_name'],['assignee_id','technician'],['assignee_id','technician_name'],['created_by','creator_name'],['report_by','report_by_name'],['from_user_id','from_name'],['requested_by','requester_name']]){
   const p=byId.get(String(out[idKey]));if(p&&nameKey in out){out[nameKey]=p.name;out[`${nameKey}_real`]=p.real_name;}
  }
  if(out.kind==='direct'&&Array.isArray(out.participants)){
   const p=contacts.find(p=>out.participants instanceof Array&&out.participants.includes(p.user_id));if(p)out.title=p.name;
  }
  for(const key of ['contact_name','contact_person'])if(typeof out[key]==='string'){const matches=contacts.filter(p=>p.real_name===out[key]||p.name===out[key]);if(matches.length===1){out[key]=matches[0].name;out[`${key}_real`]=matches[0].real_name;}}
  return out;
 };
 return visit(value) as T;
}
