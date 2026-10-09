import { ingestWebhook } from '../../../../lib/services/supplier';
import { errorResponse,json } from '../../../../lib/http';
export async function POST(req:Request){try{return json(await ingestWebhook(req));}catch(error){return errorResponse(error);}}
