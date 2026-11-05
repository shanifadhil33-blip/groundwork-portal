import { languageCookie } from '../../../../lib/language-cookie';
import { sandboxCookie, startDemo } from '../../../../lib/services/demo';
import { ApiError,errorResponse,readBody } from '../../../../lib/http';
export async function POST(req:Request){try{
 const body=await readBody(req);
 const result=await startDemo (body,process.env.VERCEL?req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()??'unknown':'local',req.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith('groundwork-sandbox='))?.slice(19));
 // Buffer the small payload before sending headers so clients can finish by byte count.
 const payload=new TextEncoder().encode(JSON.stringify(result.body));
 const response=new Response(payload,{status:201,headers:{'Content-Type':'application/json; charset=utf-8','Content-Length':String(payload.byteLength),'Cache-Control':'no-store','Set-Cookie':result.cookie}}); response.headers.append('Set-Cookie','groundwork-demo=1; Path=/; SameSite=Lax; Max-Age=2592000'); response.headers.append('Set-Cookie',sandboxCookie(result.body.workspace_id)); response.headers.append('Set-Cookie',languageCookie((body as {language?:unknown})?.language)); return response;
}catch(error){if(!(error instanceof ApiError) && !(error instanceof Error && error.name==='ZodError')){console.error('demo start failed',(error as {code?:string}).code,(error as Error).message?.slice(0,300),(error as {table?:string}).table,(error as {constraint?:string}).constraint);}if(!(error instanceof ApiError) && !(error instanceof Error && error.name==='ZodError'))return errorResponse(new ApiError(503,'demo_retry','We could not create your demo. Please try again.'));return errorResponse(error);}}
