import { z } from 'zod';
import { hash } from './shared';
import { invalid } from '../http';
export const paging={page:z.coerce.number().int().min(1).max(1000000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25),cursor:z.string().max(2048).optional()};
export function parseQuery<T extends z.ZodRawShape>(params:URLSearchParams,shape:T) {
 const schema=z.object(shape).strict();const query=schema.parse(Object.fromEntries(params));
 if(params.has('page')&&params.has('cursor'))throw invalid('Use a cursor or page, not both.','cursor');return query;
}
export function feedOffset(user:string,ws:string,query:{page:number;pageSize:number;cursor?:string}) {
 const {cursor,page,...filters}=query;const binding=hash(JSON.stringify([user,ws,filters]));let offset=(page-1)*query.pageSize;
 if(cursor){try{const decoded=JSON.parse(Buffer.from(cursor,'base64url').toString());if(decoded.binding!==binding||!Number.isSafeInteger(decoded.offset)||decoded.offset<0)throw Error();offset=decoded.offset;}catch{throw invalid('Use a valid cursor for this query.','cursor');}}
 return {offset,next:(total:number)=>offset+query.pageSize<total?Buffer.from(JSON.stringify({binding,offset:offset+query.pageSize})).toString('base64url'):null};
}
