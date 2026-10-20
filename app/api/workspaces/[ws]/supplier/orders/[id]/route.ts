import { endpoint } from '../../../../../../../lib/api';
import { closeSupplierOrder } from '../../../../../../../lib/services/archives';

export const POST = endpoint(({ user, params }) => closeSupplierOrder(user, params.ws, params.id));
