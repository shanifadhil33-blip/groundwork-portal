import { endpoint } from '../../../../../lib/api';
import * as s from '../../../../../lib/services/company-listing';
export const GET=endpoint(({user,params})=>s.listJoinRequests(user,params.ws));
