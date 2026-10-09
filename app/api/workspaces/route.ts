import { endpoint } from '../../../lib/api';
import * as w from '../../../lib/services/workspaces';
export const POST = endpoint(({user,params,body,key,req}) => w.createWorkspace(user,body,key), {"body": true, "status": 201});

export const GET = endpoint(({user}) => w.listWorkspaces(user));
