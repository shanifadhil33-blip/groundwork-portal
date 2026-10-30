import { endpoint } from '../../../lib/api';
import { getOnboarding,saveOnboarding } from '../../../lib/services/onboarding';
export const GET=endpoint(({user})=>getOnboarding(user));
import { languageCookie } from '../../../lib/language-cookie';
const save=endpoint(({user,body})=>saveOnboarding(user,body),{body:true});
export async function PATCH(req:Request) {
  const response=await save(req);
  if(response.ok) {
    const progress=await response.clone().json();
    if(progress.answers?.language)response.headers.append('Set-Cookie',languageCookie(progress.answers.language));
  }
  return response;
}
