import { endpoint } from '../../../../../../../lib/api';
import { jobChecklist, saveJobChecklist } from '../../../../../../../lib/services/job-checklists';
export const GET = endpoint(({user,params}) => jobChecklist(user,params.ws,params.id));
export const POST = endpoint(({user,params,body,key}) => saveJobChecklist(user,params.ws,params.id,body,key), {body:true});
