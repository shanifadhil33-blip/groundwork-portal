import { endpoint } from '../../../../../lib/api';
import { myDay } from '../../../../../lib/services/my-day';
export const GET = endpoint(({ user, params }) => myDay(user, params.ws), {});
