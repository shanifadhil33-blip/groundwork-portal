import { endpoint } from '../../../../lib/api';
import { readCompanyReplies } from '../../../../lib/services/company-listing';
export const POST=endpoint(({user})=>readCompanyReplies(user));
