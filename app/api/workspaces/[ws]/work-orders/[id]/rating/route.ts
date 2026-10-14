import { endpoint } from '../../../../../../../lib/api';
import { getRating, rateJob } from '../../../../../../../lib/services/ratings';
export const GET = endpoint(({ user, params }) => getRating(user, params.ws, params.id));
export const POST = endpoint(({ user, params, body }) => rateJob(user, params.ws, params.id, body), { body: true });
