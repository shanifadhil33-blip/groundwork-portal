import { startDemo } from '../../../../lib/services/demo';
import { requireUser } from '../../../../lib/auth';
import { ApiError,errorResponse,json,readBody } from '../../../../lib/http';
export async function POST(req:Request){try{
 const result=await startDemo (await readBody(req),process.env.VERCEL?req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()??'unknown':'local');
 const response=json(result.body,201,{'Set-Cookie':result.cookie}); response.headers.append('Set-Cookie','groundwork-demo=1; Path=/; SameSite=Lax; Max-Age=2592000'); return response;
}catch(error){if(!(error instanceof ApiError) && !(error instanceof Error && error.name==='ZodError'))return errorResponse(new ApiError(503,'demo_retry','We could not create your demo. Please try again.'));return errorResponse(error);}}
