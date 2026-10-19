import { endpoint } from '../../../../../lib/api';
import { listWords,saveWord } from '../../../../../lib/services/agent-words';
export const GET=endpoint(({user,params})=>listWords(user,params.ws));
export const POST=endpoint(({user,params,body})=>saveWord(user,params.ws,body),{body:true,status:201});
