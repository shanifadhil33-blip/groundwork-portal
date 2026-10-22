import { endpoint } from '../../../../../lib/api';
import { testPush } from '../../../../../lib/services/push';
export const POST=endpoint(({user})=>testPush(user));
