import { endpoint } from '../../../../../../lib/api';
import { decideLesson } from '../../../../../../lib/services/lessons';
export const POST=endpoint(({user,params,body})=>decideLesson(user,params.ws,params.id,body),{body:true});
