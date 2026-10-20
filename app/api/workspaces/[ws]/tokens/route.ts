import { endpoint } from '../../../../../lib/api';
import { assertKeyMaker,createToken,listTokens } from '../../../../../lib/services/tokens';
export const POST=endpoint(async({user,params,body})=>{await assertKeyMaker(user,params.ws);return createToken(user,params.ws,body);},{body:true,status:201});
export const GET=endpoint(({user,params,req})=>listTokens(user,params.ws,new URL(req.url).searchParams));
