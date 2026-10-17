import { z } from 'zod';
import { endpoint } from '../../../../../../lib/api';
import { listAgentLearning,savePersonalLearning,saveCompanyRule,resetPersonalLearning } from '../../../../../../lib/services/agent-learning';
export const GET=endpoint(({user,params})=>listAgentLearning(user,params.ws));
export const POST=endpoint(({user,params,body})=>{const d=z.object({scope:z.enum(['personal','company_rule']),body:z.string()}).strict().parse(body);return d.scope==='personal'?savePersonalLearning(user,params.ws,{body:d.body}):saveCompanyRule(user,params.ws,{body:d.body});},{body:true,status:201});
export const DELETE=endpoint(({user,params})=>resetPersonalLearning(user,params.ws));
