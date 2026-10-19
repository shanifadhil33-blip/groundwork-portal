import { endpoint } from '../../../../../../../lib/api';
import { freeVisitSlots, prepareClientVisit } from '../../../../../../../lib/services/client-visits';
import { z } from 'zod';
export const GET = endpoint(({user,params,req})=>freeVisitSlots(user,params.ws,{id:params.id,day:new URL(req.url).searchParams.get('day')??undefined}));
export const POST = endpoint(({user,params,body})=>{const d=z.object({tool:z.enum(['reschedule_visit','cancel_visit']),updated_at:z.string(),scheduled_for:z.string().optional()}).strict().parse(body);const {tool,...args}=d;return prepareClientVisit(user,params.ws,tool,{...args,id:params.id});},{body:true});
