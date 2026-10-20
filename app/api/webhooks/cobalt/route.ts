import { ingestWebhook } from '../../../../lib/services/supplier';
import { errorResponse,json } from '../../../../lib/http';
// JOB08 hidden (Oct 20 2026): the Cobalt webhook runs only when COBALT_ENABLED=1. Code stays.
export async function POST(req:Request){if(process.env.COBALT_ENABLED!=='1')return new Response('not connected',{status:503});try{return json(await ingestWebhook(req));}catch(error){return errorResponse(error);}}
