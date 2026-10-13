import { endpoint } from '../../../../../lib/api';
import { uploadSharedPhoto } from '../../../../../lib/services/shared-photos';
export const POST=endpoint(({user,params,body})=>uploadSharedPhoto(user,params.ws,body),{body:true,status:201});
