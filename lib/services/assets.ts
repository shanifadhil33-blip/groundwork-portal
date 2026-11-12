import { z } from 'zod';
import { ApiError, invalid } from '../http';
import { inWorkspace, insert, replay, row, update, uuid, type Context } from './shared';
export const assetKinds=['ac','water_heater','panel','pump','lift','generator','other'] as const;
const text=(max:number)=>z.string().trim().max(max,`Use ${max} characters or fewer.`).nullable().optional();
export const assetShape={name:z.string().trim().min(1,'Enter a name.').max(80,'Use 80 characters or fewer.'),kind:z.enum(assetKinds,{message:'Choose a type.'}),make:text(80),model:text(80),serial:text(80),location:text(120),installed_on:z.iso.date({message:'Choose a valid date.'}).nullable().optional(),notes:text(500)};
const createSchema=z.object({site_id:z.uuid({message:'Choose a site.'}),...assetShape}).strict();
const patchSchema=z.object({...assetShape,archived_at:z.iso.datetime({offset:true,message:'Choose a valid date.'}).nullable()}).partial().strict();
function manage(c:Context){if(c.role!=='admin'&&(c.role!=='staff'||c.staff_kind==='office'))throw new ApiError(403,'forbidden','Only an admin or supervisor can change equipment.');}
export async function listAssets(user:string,ws:string,filters:{site_id?:string;include_archived?:boolean}={}){
 return inWorkspace(user,ws,async c=>{const f=z.object({site_id:uuid.optional(),include_archived:z.boolean().optional()}).parse(filters);return (await c.db.query(`SELECT * FROM assets WHERE workspace_id=$1 AND ($2::uuid IS NULL OR site_id=$2) ${f.include_archived?'':'AND archived_at IS NULL'} ORDER BY name,id`,[ws,f.site_id??null])).rows;});
}
export async function createAsset(user:string,ws:string,body:unknown,key?:string){return inWorkspace(user,ws,async c=>{manage(c);const data=createSchema.parse(body);const site=await row(c,'sites',data.site_id);if(site.archived_at)throw invalid('This site is archived.');return replay(c.db,user,ws+'/assets',key,data,()=>insert(c,'assets',{...data,workspace_id:ws,created_by:user}));});}
export async function updateAsset(user:string,ws:string,id:string,body:unknown){return inWorkspace(user,ws,async c=>{manage(c);await row(c,'assets',id);const data=patchSchema.parse(body);if(!Object.keys(data).length)throw invalid('Provide at least one change.');return update(c,'assets',id,data);});}
async function history(c:Context,id:string){return (await c.db.query(`SELECT w.id,w.order_number,w.title,w.status,
 CASE WHEN w.status='done' THEN coalesce(w.report_at,(SELECT max(e.created_at) FROM work_order_events e WHERE e.workspace_id=w.workspace_id AND e.work_order_id=w.id AND e.details->>'to_status'='done'),w.updated_at) END AS finished_at,
 w.report_outcome AS outcome,a.name AS technician_name,w.created_at
 FROM work_orders w LEFT JOIN LATERAL visible_assignee(w.workspace_id,w.id) a ON true
 WHERE w.workspace_id=$1 AND w.asset_id=$2 ORDER BY w.created_at DESC,w.order_number DESC,w.id DESC`,[c.ws,id])).rows;}
export async function assetHistory(user:string,ws:string,id:string){return inWorkspace(user,ws,async c=>{await row(c,'assets',id);return history(c,id);});}
export async function getAsset(user:string,ws:string,id:string){return inWorkspace(user,ws,async c=>({...await row(c,'assets',id),history:await history(c,id)}));}
/** Validate in the same job transaction. The composite foreign key guards concurrent changes. */
export async function checkJobAsset(c:Context,id:string|null|undefined,site:string){if(!id)return;const asset=await row(c,'assets',id);if(asset.site_id!==site)throw invalid('That unit is at a different site.','asset_id');if(asset.archived_at)throw invalid('That unit is archived.','asset_id');}
