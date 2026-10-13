import { endpoint } from '../../../../../../lib/api';
import { unreadMessages } from '../../../../../../lib/services/messages';
export const GET=endpoint(({user,params})=>unreadMessages(user,params.ws));
