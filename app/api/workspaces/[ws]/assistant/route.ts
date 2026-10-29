export const maxDuration=60;
import { endpoint } from '../../../../../lib/api';
import { assistant } from '../../../../../lib/services/assistant';
import { limitAiRequest } from '../../../../../lib/ai-limits';
import { ApiError } from '../../../../../lib/http';
import { failureWords } from '../../../../../lib/agent/failure-words';
import { getPreferences } from '../../../../../lib/services/settings';
export const POST=endpoint(async({user,params,body})=>{
 // Normal requests need no database work for the per instance limiter.
 try { limitAiRequest(user,'assistant'); }
 catch(error) {
  if(error instanceof ApiError)throw new ApiError(error.status,error.code,failureWords((await getPreferences(user,false))?.language,error.message));
  throw error;
 }
 return assistant(user,params.ws,body);
},{body:true});
