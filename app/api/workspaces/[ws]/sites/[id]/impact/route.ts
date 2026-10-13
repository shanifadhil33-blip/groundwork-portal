import { endpoint } from '../../../../../../../lib/api';
import { siteImpact } from '../../../../../../../lib/services/clients';
export const GET=endpoint(({user,params})=>siteImpact(user,params.ws,params.id));
