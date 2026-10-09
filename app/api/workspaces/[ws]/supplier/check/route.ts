import { endpoint } from '../../../../../../lib/api';
import * as supplier from '../../../../../../lib/services/supplier';
export const POST=endpoint(({user,params})=>supplier.check(user,params.ws));
