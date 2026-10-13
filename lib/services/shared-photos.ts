import { invalid, missing } from '../http';
import { inWorkspace, uuid } from './shared';
import { looksLike, uploadSchema } from './photos';
export async function uploadSharedPhoto(user:string,ws:string,body:unknown){
 const d=uploadSchema.omit({kind:true}).parse(body),bytes=Buffer.from(d.data,'base64');
 if(bytes.length<100||bytes.length>600*1024||!looksLike(d.mime,bytes))throw invalid('This file is not a photo.','data');
 return inWorkspace(user,ws,async c=>(await c.db.query('INSERT INTO shared_photos(workspace_id,uploaded_by,mime,bytes,width,height) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[ws,user,d.mime,bytes,d.width,d.height])).rows[0]);
}
export async function getSharedPhoto(user:string,ws:string,id:string){uuid.parse(id);return inWorkspace(user,ws,async c=>{const p=(await c.db.query('SELECT mime,bytes FROM shared_photos WHERE workspace_id=$1 AND id=$2',[ws,id])).rows[0];if(!p)throw missing();return p;});}
