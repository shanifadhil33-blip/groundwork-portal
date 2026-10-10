import { endpoint } from '../../../../../lib/api';
import { requestSites } from '../../../../../lib/services/clients';
export const GET = endpoint(({user,params}) => requestSites(user,params.ws));
