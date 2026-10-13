import { endpoint } from '../../../../../../lib/api';
import { decideKeyApproval } from '../../../../../../lib/services/key-approvals';
export const POST=endpoint(({user,params,body})=>decideKeyApproval(user,params.ws,params.id,body),{body:true});
