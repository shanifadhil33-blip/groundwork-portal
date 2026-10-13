import { endpoint } from '../../../../../lib/api';
import { getTeamSpace,sendTeamMessage } from '../../../../../lib/services/team-space';
export const GET=endpoint(({user,params})=>getTeamSpace(user,params.ws));
export const POST=endpoint(({user,params,body,key})=>sendTeamMessage(user,params.ws,body,key),{body:true,status:201});
