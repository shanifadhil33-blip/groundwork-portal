import { endpoint } from '../../../../lib/api';
import * as s from '../../../../lib/services/settings';
export const GET=endpoint(({user,params})=>s.getPreferences(user));
export const PATCH=endpoint(({user,params,body})=>s.patchPreferences(user,body),{body:true});
