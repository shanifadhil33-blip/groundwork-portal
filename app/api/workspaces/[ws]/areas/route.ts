import { endpoint } from '../../../../../lib/api';
import { workspaceAreas } from '../../../../../lib/services/assign';
export const GET = endpoint(({ user, params }) => workspaceAreas(user, params.ws), {});
