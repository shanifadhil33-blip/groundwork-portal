import { endpoint } from '../../../../lib/api';
import { onboardingAssistant } from '../../../../lib/services/onboarding-assistant';
export const POST=endpoint(({user,body})=>onboardingAssistant(user,body),{body:true});
