import { makeJobLate } from '../../../../lib/services/demo';
import { requireUser } from '../../../../lib/auth';
import { errorResponse, json } from '../../../../lib/http';
/** DEMO12: "Demo: make a job late". Demo sandboxes only. */
export async function POST(req:Request){try{return json(await makeJobLate(await requireUser(req)),200);}catch(error){return errorResponse(error);}}
