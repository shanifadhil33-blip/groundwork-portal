import { endpoint } from '../../../../lib/api';
import * as s from '../../../../lib/services/notifications';
export const GET=endpoint(({user,params,req})=>s.unreadCount(user));
