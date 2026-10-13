import { endpoint } from '../../../../../../../lib/api';
import { archiveMember, unarchiveMember } from '../../../../../../../lib/services/members';
export const POST=endpoint(({user,params})=>archiveMember(user,params.ws,params.userId));
export const DELETE=endpoint(({user,params})=>unarchiveMember(user,params.ws,params.userId));
