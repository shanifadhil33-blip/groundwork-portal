import { endpoint } from '../../../../../lib/api';
import { ownerOverview,addMoney } from '../../../../../lib/services/owner-overview';
export const GET=endpoint(({user,params})=>ownerOverview(user,params.ws));
export const POST=endpoint(({user,params,body})=>addMoney(user,params.ws,body),{body:true,status:201});
