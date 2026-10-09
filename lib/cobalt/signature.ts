import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../http';
import { requiredEnv } from '../env';
export function constantEqual(a:string,b:string) {
 const left=Buffer.from(a),right=Buffer.from(b);
 return left.length===right.length && timingSafeEqual(left,right);
}
export function signature(timestamp:string,rawBody:string) {
 return createHmac('sha256',requiredEnv('COBALT_WEBHOOK_SECRET')).update(`${timestamp}.${rawBody}`).digest('hex');
}
export function verifySignature(headers:Headers,rawBody:string,now=Date.now()) {
 const timestamp=headers.get('x-cobalt-timestamp'),supplied=headers.get('x-cobalt-signature');
 if(!timestamp || !supplied || !/^\d{1,12}$/.test(timestamp) || Math.abs(now-Number(timestamp)*1000)>300000 || !/^[a-f0-9]{64}$/i.test(supplied) || !constantEqual(signature(timestamp,rawBody),supplied.toLowerCase()))
  throw new ApiError(401,'invalid_signature','The Cobalt webhook signature is missing, invalid, or expired.');
}
export function signedRequest(payload:unknown) {
 const body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000));
 return new Request('http://localhost/api/webhooks/cobalt',{method:'POST',body,headers:{'content-type':'application/json','x-cobalt-timestamp':timestamp,'x-cobalt-signature':signature(timestamp,body)}});
}
