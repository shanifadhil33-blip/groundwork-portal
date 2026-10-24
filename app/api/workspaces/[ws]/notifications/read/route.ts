import { endpoint } from '../../../../../../lib/api';
import { readNotifications } from '../../../../../../lib/services/notifications';
export const POST=endpoint(({user,params,body})=>readNotifications(user,params.ws,body),{body:true});
