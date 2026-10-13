import { endpoint } from '../../../../../../../lib/api';
import { setClientKind } from '../../../../../../../lib/services/members';
export const PUT=endpoint(({user,params,body})=>setClientKind(user,params.ws,params.userId,body),{body:true});
