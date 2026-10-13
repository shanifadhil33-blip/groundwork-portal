import { endpoint } from '../../../../../../../lib/api';
import { clientImpact } from '../../../../../../../lib/services/clients';
export const GET=endpoint(({user,params})=>clientImpact(user,params.ws,params.id));
