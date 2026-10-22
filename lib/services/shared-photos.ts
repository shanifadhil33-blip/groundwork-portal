import { invalid, missing } from '../http';
import { inWorkspace, uuid } from './shared';
import { looksLike, uploadSchema } from './photos';
export async function uploadSharedPhoto(user:string,ws:string,body:unknown){
 const d=uploadSchema.omit({kind:true}).parse(body),bytes=Buffer.from(d.data,'base64');
 if(bytes.length<100||bytes.length>600*1024||!looksLike(d.mime,bytes))throw invalid('This file is not a photo.','data');
 return inWorkspace(user,ws,async c=>(await c.db.query('INSERT INTO shared_photos(workspace_id,uploaded_by,mime,bytes,width,height) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[ws,user,d.mime,bytes,d.width,d.height])).rows[0]);
}
export async function getSharedPhoto(user:string,ws:string,id:string){
 uuid.parse(id);
 let sandboxBytes:Buffer|undefined;
 const result=await inWorkspace(user,ws,async c=>{
  const p=(await c.db.query(`SELECT p.mime,p.bytes,w.is_demo FROM shared_photos p JOIN workspaces w ON w.id=p.workspace_id WHERE p.workspace_id=$1 AND p.id=$2`,[ws,id])).rows[0];
  if(!p)throw missing();
  // Preserve the private sandbox image across contact-name personalization.
  if(p.is_demo)sandboxBytes=p.bytes;
  return {mime:p.mime,bytes:p.bytes};
 });
 return sandboxBytes?{...result,bytes:sandboxBytes}:result;
}
