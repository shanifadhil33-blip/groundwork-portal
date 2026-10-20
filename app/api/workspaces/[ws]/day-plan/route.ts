import { endpoint } from '../../../../../lib/api';
import { getDayPlan, postDayPlan } from '../../../../../lib/services/day-plan';

export const GET = endpoint(({ user, params }) => getDayPlan(user, params.ws));
export const POST = endpoint(({ user, params, body }) => postDayPlan(user, params.ws, body), { body: true });
