import { z } from 'zod';
import { invalid } from './http';
import { priority, status, uuid } from './services/shared';
const querySchema=z.object({
 q:z.string().trim().max(500).optional(),
 status:z.array(status).default([]),priority:z.array(priority).default([]),
 overdue:z.enum(['true','false']).transform(v=>v==='true').optional(),
 active:z.enum(['true','false']).transform(v=>v==='true').optional(),
 today:z.enum(['true','false']).transform(v=>v==='true').optional(),
 id:uuid.optional(),asset_id:uuid.optional(),client_id:uuid.optional(),site_id:uuid.optional(),assignee_id:z.union([uuid,z.literal('unassigned')]).optional(),
 sort:z.enum(['updated_at','created_at','scheduled_for','due_on','priority','title']).default('updated_at'),
 dir:z.enum(['asc','desc']).default('desc'),
 page:z.coerce.number().int().min(1).max(1000000).default(1),
 pageSize:z.coerce.number().int().min(1).max(100).default(25),
 cursor:z.string().max(2048).optional(),
 archived:z.enum(['true','false']).optional(),
});
export function parseListQuery(params: URLSearchParams) {
 // A shared or old link may carry words this list does not know (?tab=approve, ?status=late).
 // Those are ignored, never turned into an error page. Each known value that does not fit is dropped too.
 const shape=querySchema.shape;
 const obj:Record<string,unknown>={};
 for(const key of ['archived','overdue','active','today','q','id','asset_id','client_id','site_id','assignee_id','sort','dir','page','pageSize','cursor'] as const){
  if(!params.has(key))continue;
  const value=params.get(key);
  if(shape[key].safeParse(value).success)obj[key]=value;
 }
 obj.status=[...params.getAll('status'),...params.getAll('status[]')].filter(v=>status.safeParse(v).success);
 obj.priority=[...params.getAll('priority'),...params.getAll('priority[]')].filter(v=>priority.safeParse(v).success);
 const query=querySchema.parse(obj);
 if(query.cursor && params.has('page'))throw invalid('Use a cursor or page, not both.','cursor');
 return query;
}
type ListQuery=ReturnType<typeof parseListQuery>;
