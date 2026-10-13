import { requireUser } from './auth';
import { ApiError,errorResponse, json, readBody } from './http';
export type RouteContext={params:Promise<Record<string,string>>};
type Input={user:string;params:Record<string,string>;body:unknown;key?:string;req:Request};
export function endpoint(fn:(input:Input)=>Promise<unknown>,options:{body?:boolean;status?:number;etag?:boolean}={}) {
 return async (req:Request,context?:RouteContext)=>{
  try {
   const user=await requireUser(req);
   const expectedUser=req.headers.get('groundwork-user');if(expectedUser&&expectedUser!==user)throw new ApiError(409,'account_changed','Your account changed. Sign in as the person who wrote this before sending.');
   const params=context?await context.params:{};
   const body=options.body?await readBody(req):undefined;
   const result=await fn({user,params,body,key:req.headers.get('Idempotency-Key')??undefined,req});
   const updated=(result as {updated_at?:Date|string})?.updated_at;
   const etag=updated?new Date(updated).toISOString():undefined;
   return json(result,options.status??200,options.etag && etag?{ETag:'"'+etag+'"'}:undefined);
  } catch(error) {return errorResponse(error);}
 };
}
