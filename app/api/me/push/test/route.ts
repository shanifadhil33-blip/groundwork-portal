import { endpoint } from '../../../../../lib/api';
import { sendPush } from '../../../../../lib/services/push';
export const POST=endpoint(async({user})=>({sent:await sendPush([user],{title:'Groundwork',body:'Notifications are on for this device.',url:'/settings',tag:'test'})}));
