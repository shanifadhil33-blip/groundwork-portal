import { endpoint } from '../../../../../lib/api';
import { waitingPrices } from '../../../../../lib/services/price-changes';
export const GET = endpoint(({user,params}) => waitingPrices(user,params.ws));
