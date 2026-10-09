import { endpoint } from '../../../../../../../lib/api';
import * as s from '../../../../../../../lib/services/notifications';
export const POST=endpoint(({user,params,req})=>s.markNotification(user,params.ws,params.id,false));
