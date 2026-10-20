import { cronSync } from '../../../../lib/services/supplier';
import { constantEqual } from '../../../../lib/cobalt/signature';
import { ApiError,errorResponse,json } from '../../../../lib/http';
// JOB08 hidden (Oct 20 2026): the nightly Cobalt sync is off unless COBALT_ENABLED=1, and its Vercel cron is removed. Code stays.
export async function GET(req:Request){if(process.env.COBALT_ENABLED!=='1')return new Response('not connected',{status:503});try{const secret=process.env.CRON_SECRET;if(!secret||!constantEqual(req.headers.get('authorization')??'','Bearer '+secret))throw new ApiError(401,'unauthorized','A valid cron bearer token is required.');return json(await cronSync());}catch(error){return errorResponse(error);}}
export const POST=GET;
