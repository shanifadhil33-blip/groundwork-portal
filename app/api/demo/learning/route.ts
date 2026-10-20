import { learningJob } from '../../../../lib/services/demo';
import { requireUser } from '../../../../lib/auth';
import { errorResponse, json } from '../../../../lib/http';
/** DEMO12: "Demo: before and after learning". Demo sandboxes only. */
export async function POST(req:Request){try{return json(await learningJob(await requireUser(req)),200);}catch(error){return errorResponse(error);}}
