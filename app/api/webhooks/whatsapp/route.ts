import { timingSafeEqual } from 'node:crypto';
// Real provider wiring is deliberately outside this stub. It performs no writes.
export async function POST(req:Request){
 const secret=process.env.WHATSAPP_WEBHOOK_SECRET;
 if(!secret)return new Response('not connected',{status:503});
 const supplied=Buffer.from(req.headers.get('x-whatsapp-secret')??''),expected=Buffer.from(secret);
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return new Response('Not allowed',{status:401});
 return new Response('not connected',{status:503});
}
