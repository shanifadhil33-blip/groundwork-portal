import { endpoint } from '../../../../../../../lib/api';
import { companyHistory } from '../../../../../../../lib/services/company-history';
/** LEARN10: what this company's own finished jobs say about this one (office only). */
export const GET=endpoint(({user,params})=>companyHistory(user,params.ws,params.id));
