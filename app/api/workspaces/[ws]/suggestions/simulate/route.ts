import { endpoint } from '../../../../../../lib/api';
import { simulateWhatsApp } from '../../../../../../lib/services/whatsapp';
export const POST=endpoint(({user,params})=>simulateWhatsApp(user,params.ws),{status:201});
