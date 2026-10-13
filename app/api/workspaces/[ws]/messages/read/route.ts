import { endpoint } from '../../../../../../lib/api';
import { markThreadRead,undoThreadRead } from '../../../../../../lib/services/messages';
export const POST=endpoint(({user,params,body})=>markThreadRead(user,params.ws,body),{body:true});

export const PATCH=endpoint(({user,params,body})=>undoThreadRead(user,params.ws,body),{body:true});
