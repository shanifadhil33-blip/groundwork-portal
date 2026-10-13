import { endpoint } from '../../../../../lib/api';
import { listKeyApprovals } from '../../../../../lib/services/key-approvals';
export const GET=endpoint(({user,params})=>listKeyApprovals(user,params.ws));
