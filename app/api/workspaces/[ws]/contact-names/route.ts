import { endpoint } from '../../../../../lib/api';
import { listContactNames } from '../../../../../lib/services/contact-names';
export const GET=endpoint(({user,params})=>listContactNames(user,params.ws));
