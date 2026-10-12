import { endpoint } from '../../../../lib/api';
import * as p from '../../../../lib/services/push';
export const GET=endpoint(async({user})=>({...await p.pushStatus(user),...p.pushPublicKey()}));
export const POST=endpoint(({user,body})=>p.subscribePush(user,body),{body:true});
export const DELETE=endpoint(({user,body})=>p.unsubscribePush(user,body),{body:true});
