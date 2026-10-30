import { endpoint } from '../../../../lib/api';
import * as s from '../../../../lib/services/settings';
import { languageCookie } from '../../../../lib/language-cookie';
function preferencesRoute(save: boolean) {
  const route = endpoint(({user,body}) => save ? s.patchPreferences(user,body) : s.getPreferences(user), {body:save});
  return async (req: Request) => {
    const response = await route(req);
    if (response.ok) {
      const preference = await response.clone().json();
      response.headers.append('Set-Cookie', languageCookie(preference?.language));
    }
    return response;
  };
}
export const GET = preferencesRoute(false);
export const PATCH = preferencesRoute(true);
