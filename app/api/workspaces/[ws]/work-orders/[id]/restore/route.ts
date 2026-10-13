import { endpoint } from '../../../../../../../lib/api';
import { restoreJob } from '../../../../../../../lib/services/job-records';
export const POST=endpoint(({user,params,body})=>restoreJob(user,params.ws,params.id,body),{body:true});
