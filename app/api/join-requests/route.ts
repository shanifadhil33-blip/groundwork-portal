import { endpoint } from '../../../lib/api';
import * as s from '../../../lib/services/company-listing';
export const GET=endpoint(({user})=>s.myJoinRequests(user));
export const POST=endpoint(({user,body})=>s.requestJoin(user,body),{body:true,status:201});
