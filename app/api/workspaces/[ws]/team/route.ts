import { endpoint } from '../../../../../lib/api';
import { teamToday } from '../../../../../lib/services/team';
export const GET = endpoint(({ user, params }) => teamToday(user, params.ws), {});
