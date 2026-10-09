import { switchDemo } from '../../../../lib/services/demo';
import { requireUser } from '../../../../lib/auth';
import { ApiError,errorResponse,json,readBody } from '../../../../lib/http';
export async function POST(req:Request){try{
 const result=await switchDemo(await requireUser(req),await readBody(req));
 return json(result.body,200,{'Set-Cookie':result.cookie});
}catch(error){return errorResponse(error);}}
