import { endpoint } from '../../../../../../lib/api';
import * as supplier from '../../../../../../lib/services/supplier';
export const GET=endpoint(({user,params})=>supplier.syncRuns(user,params.ws));
