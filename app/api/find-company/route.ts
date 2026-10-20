import { endpoint } from '../../../lib/api';
import * as s from '../../../lib/services/company-listing';
export const GET=endpoint(({user,req})=>s.searchCompanies(user,new URL(req.url).searchParams.get('q')??''));
