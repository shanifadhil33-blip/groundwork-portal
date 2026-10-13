import { endpoint } from '../../../../lib/api';
import { translateUi } from '../../../../lib/services/translations';
export const POST = endpoint(({ user, body }) => translateUi(user, body), { body: true });
