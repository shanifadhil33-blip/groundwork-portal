import { endpoint } from '../../../../../../../lib/api';
import { updatePersonalLearning,deletePersonalLearning } from '../../../../../../../lib/services/agent-learning';
export const PATCH=endpoint(({user,params,body})=>updatePersonalLearning(user,params.ws,params.id,body),{body:true});
export const DELETE=endpoint(({user,params})=>deletePersonalLearning(user,params.ws,params.id));
