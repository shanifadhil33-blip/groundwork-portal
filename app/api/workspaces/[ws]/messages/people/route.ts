import { endpoint } from '../../../../../../lib/api';
import { messagePeople } from '../../../../../../lib/services/messages';
export const GET=endpoint(({user,params})=>messagePeople(user,params.ws));
