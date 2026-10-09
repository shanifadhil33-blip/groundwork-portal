import { cronSync } from '../../../../lib/services/supplier';
import { constantEqual } from '../../../../lib/cobalt/signature';
import { ApiError,errorResponse,json } from '../../../../lib/http';
export async function GET(req:Request){try{const secret=process.env.CRON_SECRET;if(!secret||!constantEqual(req.headers.get('authorization')??'','Bearer '+secret))throw new ApiError(401,'unauthorized','A valid cron bearer token is required.');return json(await cronSync());}catch(error){return errorResponse(error);}}
export const POST=GET;
