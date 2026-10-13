import { endpoint } from '../../../../../../lib/api';
import { moderateTeamMessage } from '../../../../../../lib/services/team-space';
export const POST=endpoint(({user,params,body})=>moderateTeamMessage(user,params.ws,params.id,body),{body:true});
