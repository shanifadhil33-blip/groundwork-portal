import { endpoint } from '../../../../../lib/api';
import { previousTechnician } from '../../../../../lib/services/client-visits';
export const GET = endpoint(({user,params})=>previousTechnician(user,params.ws));
