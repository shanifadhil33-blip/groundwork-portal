import { endpoint } from '../../../../../../../lib/api';
import * as supplier from '../../../../../../../lib/services/supplier';
export const GET=endpoint(({user,params,req})=>supplier.events(user,params.ws,new URL(req.url).searchParams));
