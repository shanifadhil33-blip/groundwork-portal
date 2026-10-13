import { endpoint } from '../../../../../lib/api';
import { listMessages,listThreads,sendMessage } from '../../../../../lib/services/messages';
export const GET=endpoint(({user,params,req})=>{const q=new URL(req.url).searchParams;return q.has('conversation_id')||q.has('work_order_id')?listMessages(user,params.ws,Object.fromEntries(q)):listThreads(user,params.ws);});
export const POST=endpoint(({user,params,body,key})=>sendMessage(user,params.ws,body,key),{body:true,status:201});
