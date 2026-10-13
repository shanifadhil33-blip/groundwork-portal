import { endpoint } from '../../../../../../lib/api';
import { markThreadRead } from '../../../../../../lib/services/messages';
export const POST=endpoint(({user,params,body})=>markThreadRead(user,params.ws,body),{body:true});
