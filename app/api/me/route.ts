import { endpoint } from '../../../lib/api';
import * as w from '../../../lib/services/workspaces';
export const GET = endpoint(({user,params,body,key,req}) => w.me(user), {});

import { patchProfile } from '../../../lib/services/settings';
export const PATCH=endpoint(({user,body})=>patchProfile(user,body),{body:true});
