import { ids } from '../scripts/seed';
import { createWorkOrder,getWorkOrder } from '../lib/services/work-orders';
import { decideSuggestion } from '../lib/services/suggestions';
/** Tests of an existing job approve the request explicitly, like the supervisor does. */
export async function approvedClientRequest(user:string,ws:string,body:unknown){const s=await createWorkOrder(user,ws,body);const a=await decideSuggestion(ids.sam,ws,s.id,{decision:'approved'});return getWorkOrder(user,ws,a.work_order_id);}
