import { endpoint } from '../../../../../../../lib/api';
import { restoreRow } from '../../../../../../../lib/services/imports';
export const POST=endpoint(({user,params})=>restoreRow(user,params.ws,params.rowId),{body:false});
