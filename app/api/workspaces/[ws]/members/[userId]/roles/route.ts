import { endpoint } from '../../../../../../../lib/api';
import { setMemberRoles } from '../../../../../../../lib/services/members';
export const PUT=endpoint(({user,params,body})=>setMemberRoles(user,params.ws,params.userId,body),{body:true});
