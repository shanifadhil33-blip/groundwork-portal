import { endpoint } from '../../../../../lib/api';
import { inWorkspace, uuid } from '../../../../../lib/services/shared';
import { visitChargeFor } from '../../../../../lib/services/visit-charge';
export const GET = endpoint(({user,params,req}) => {
 const site = uuid.parse(new URL(req.url).searchParams.get('site_id'));
 return inWorkspace(user,params.ws,c=>visitChargeFor(c,site));
});
