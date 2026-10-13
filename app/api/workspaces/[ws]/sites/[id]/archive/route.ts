import { endpoint } from '../../../../../../../lib/api';
import { setSiteArchived } from '../../../../../../../lib/services/clients';
/** POST archives, DELETE unarchives. */
export const POST=endpoint(({user,params})=>setSiteArchived(user,params.ws,params.id,true));
export const DELETE=endpoint(({user,params})=>setSiteArchived(user,params.ws,params.id,false));
