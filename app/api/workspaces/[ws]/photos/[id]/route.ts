import { requireUser } from '../../../../../../lib/auth';
import { type RouteContext } from '../../../../../../lib/api';
import { errorResponse } from '../../../../../../lib/http';
import { getSharedPhoto } from '../../../../../../lib/services/shared-photos';
export async function GET(req:Request,ctx:RouteContext){try{const user=await requireUser(req),p=await ctx.params,photo=await getSharedPhoto(user,p.ws,p.id);return new Response(new Uint8Array(photo.bytes),{headers:{'Content-Type':photo.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});}catch(e){return errorResponse(e);}}
