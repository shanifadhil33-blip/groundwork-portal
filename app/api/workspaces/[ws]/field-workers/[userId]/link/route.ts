import { endpoint } from '../../../../../../../lib/api';
import { newFieldLink } from '../../../../../../../lib/services/field-signin';
export const POST = endpoint(({user,params}) => newFieldLink(user,params.ws,params.userId), {status:201});
