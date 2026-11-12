import { cleanupPersonalData } from '../../../../lib/services/data-protection';
import { cleanupDemo } from '../../../../lib/services/demo';
import { pruneAgentQuota } from '../../../../lib/services/agent-quota';
import { constantEqual } from '../../../../lib/cobalt/signature';
import { ApiError,errorResponse,json } from '../../../../lib/http';
export async function GET(req:Request){try{const secret=process.env.CRON_SECRET;if(!secret||!constantEqual(req.headers.get('authorization')??'','Bearer '+secret))throw new ApiError(401,'unauthorized','A valid cron bearer token is required.');const demo=await cleanupDemo();await pruneAgentQuota();const retention=await cleanupPersonalData();return json({...demo,retention});}catch(error){return errorResponse(error);}}
export const POST=GET;
