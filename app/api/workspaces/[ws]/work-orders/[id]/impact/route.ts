import { endpoint } from '../../../../../../../lib/api';
import { jobImpact } from '../../../../../../../lib/services/job-records';
export const GET=endpoint(({user,params})=>jobImpact(user,params.ws,params.id));
