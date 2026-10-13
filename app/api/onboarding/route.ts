import { endpoint } from '../../../lib/api';
import { getOnboarding,saveOnboarding } from '../../../lib/services/onboarding';
export const GET=endpoint(({user})=>getOnboarding(user));
export const PATCH=endpoint(({user,body})=>saveOnboarding(user,body),{body:true});
