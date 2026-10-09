import { requireUser } from '../../../../../../../lib/auth';
import { errorResponse } from '../../../../../../../lib/http';
import { type RouteContext } from '../../../../../../../lib/api';
import { errorReport } from '../../../../../../../lib/services/imports';
export async function GET(req:Request,ctx:RouteContext){try{const user=await requireUser(req),params=await ctx.params;return new Response(await errorReport(user,params.ws,params.id),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="import-errors.csv"'}});}catch(e){return errorResponse(e);}}
