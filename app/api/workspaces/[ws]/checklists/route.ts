import { endpoint } from '../../../../../lib/api';
import { checklistTemplates, saveChecklistTemplate } from '../../../../../lib/services/job-checklists';
export const GET = endpoint(({user,params}) => checklistTemplates(user,params.ws));
export const PUT = endpoint(({user,params,body}) => saveChecklistTemplate(user,params.ws,body), {body:true});
