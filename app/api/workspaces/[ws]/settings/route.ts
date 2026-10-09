import { endpoint } from '../../../../../lib/api';
import * as s from '../../../../../lib/services/settings';
export const GET=endpoint(({user,params})=>s.getSettings(user,params.ws));
export const PATCH=endpoint(({user,params,body})=>s.patchSettings(user,params.ws,body),{body:true});
