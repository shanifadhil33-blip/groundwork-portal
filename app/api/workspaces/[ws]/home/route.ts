import { endpoint } from '../../../../../lib/api';
import { homeSummary } from '../../../../../lib/services/home';
export const GET = endpoint(({ user, params }) => homeSummary(user, params.ws), {});
