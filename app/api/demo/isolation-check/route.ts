import { endpoint } from '../../../../lib/api';
import { isolationCheck } from '../../../../lib/services/demo';
export const GET=endpoint(({user})=>isolationCheck(user));
