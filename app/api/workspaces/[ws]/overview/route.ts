import { endpoint } from '../../../../../lib/api';
import { ownerOverview,addMoney } from '../../../../../lib/services/owner-overview';
export const GET=endpoint(({user,params})=>ownerOverview(user,params.ws));
export const POST=endpoint(({user,params,body,key})=>addMoney(user,params.ws,body,key),{body:true,status:201});
