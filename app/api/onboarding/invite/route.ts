import { endpoint } from '../../../../lib/api';
import { onboardingInvite } from '../../../../lib/services/onboarding';
export const GET=endpoint(({user,req})=>onboardingInvite(user,new URL(req.url).searchParams.get('token')??''));
import { onboardingAcceptInvite } from '../../../../lib/services/onboarding';
export const POST=endpoint(({user,body})=>onboardingAcceptInvite(user,body),{body:true});
