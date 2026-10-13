import { endpoint } from '../../../../../../../lib/api';
import { confirmVisit } from '../../../../../../../lib/services/quotes';
export const POST = endpoint(({ user, params }) => confirmVisit(user, params.ws, params.id), {});
