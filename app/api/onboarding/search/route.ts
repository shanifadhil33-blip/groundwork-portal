import { endpoint } from '../../../../lib/api';
import { findCompany } from '../../../../lib/services/onboarding';
export const GET=endpoint(({user,req})=>findCompany(user,new URL(req.url).searchParams.get('q')??''));
