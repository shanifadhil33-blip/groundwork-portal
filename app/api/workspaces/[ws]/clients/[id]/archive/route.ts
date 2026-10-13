import { endpoint } from '../../../../../../../lib/api';
import { setClientArchived } from '../../../../../../../lib/services/clients';
/** POST archives, DELETE unarchives. */
export const POST=endpoint(({user,params})=>setClientArchived(user,params.ws,params.id,true));
export const DELETE=endpoint(({user,params})=>setClientArchived(user,params.ws,params.id,false));
