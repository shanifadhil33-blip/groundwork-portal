import { endpoint } from '../../../../lib/api';
import { requestMyAccountDeletion } from '../../../../lib/services/data-protection';
export const POST = endpoint(({user,body}) => requestMyAccountDeletion(user,body), {body:true});
