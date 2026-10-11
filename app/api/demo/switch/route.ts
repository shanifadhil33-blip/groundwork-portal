import { switchDemo } from '../../../../lib/services/demo';
import { requireUser } from '../../../../lib/auth';
import { ApiError,errorResponse,json,readBody } from '../../../../lib/http';
export async function POST(req:Request){try{
 const result=await switchDemo(await requireUser(req),await readBody(req));
 const response=json(result.body,200,{'Set-Cookie':result.cookie}); response.headers.append('Set-Cookie','groundwork-demo=1; Path=/; SameSite=Lax; Max-Age=2592000'); return response;
}catch(error){return errorResponse(error);}}
