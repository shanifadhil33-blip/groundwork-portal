import { z } from 'zod';
import { invalid } from './http';
import { priority, status, uuid } from './services/shared';
const querySchema=z.object({
 q:z.string().trim().max(500).optional(),
 status:z.array(status).default([]),priority:z.array(priority).default([]),
 overdue:z.enum(['true','false']).transform(v=>v==='true').optional(),
 active:z.enum(['true','false']).transform(v=>v==='true').optional(),
 today:z.enum(['true','false']).transform(v=>v==='true').optional(),
 client_id:uuid.optional(),assignee_id:z.union([uuid,z.literal('unassigned')]).optional(),
 sort:z.enum(['updated_at','created_at','scheduled_for','due_on','priority','title']).default('updated_at'),
 dir:z.enum(['asc','desc']).default('desc'),
 page:z.coerce.number().int().min(1).max(1000000).default(1),
 pageSize:z.coerce.number().int().min(1).max(100).default(25),
 cursor:z.string().max(2048).optional(),
});
export function parseListQuery(params: URLSearchParams) {
 const known=new Set(['overdue','active','today','q','status','status[]','priority','priority[]','client_id','assignee_id','sort','dir','page','pageSize','cursor']);
 for(const key of params.keys())if(!known.has(key))throw invalid('Unknown query parameter.',key);
 const obj:Record<string,unknown>={};
 for(const key of ['overdue','active','today','q','client_id','assignee_id','sort','dir','page','pageSize','cursor'])if(params.has(key))obj[key]=params.get(key);
 for(const key of ['status','priority'])obj[key]=[...params.getAll(key),...params.getAll(key+'[]')];
 const query=querySchema.parse(obj);
 if(query.cursor && params.has('page'))throw invalid('Use a cursor or page, not both.','cursor');
 return query;
}
type ListQuery=ReturnType<typeof parseListQuery>;
