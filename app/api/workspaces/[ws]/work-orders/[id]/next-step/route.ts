import { endpoint } from '../../../../../../../lib/api';
import { jobNextStep, prepareJobNextStep, returnSlots } from '../../../../../../../lib/services/job-next-step';
export const GET=endpoint(({user,params,req})=>new URL(req.url).searchParams.has('slots')?returnSlots(user,params.ws,params.id):jobNextStep(user,params.ws,params.id));
export const POST=endpoint(({user,params,body})=>prepareJobNextStep(user,params.ws,params.id,body),{body:true});
