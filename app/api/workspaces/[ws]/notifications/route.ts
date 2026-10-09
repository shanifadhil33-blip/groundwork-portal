import { endpoint } from '../../../../../lib/api';
import * as s from '../../../../../lib/services/notifications';
export const GET=endpoint(({user,params,req})=>s.listNotifications(user,params.ws,new URL(req.url).searchParams));
