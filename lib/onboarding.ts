import { z } from 'zod';
import { LANGUAGES } from './languages';
import { TRADES } from './trades';
import { isCountry,isCurrency,normalizeRegion } from './countries/rules';
export const STEPS=['language','identity','profile','company','country','region','currency','size','trades','days','hours','invite','done'] as const;
export type OnboardingStep=typeof STEPS[number];
export const onboardingAnswers=z.object({
 language:z.enum(LANGUAGES.map(l=>l.code) as [string,...string[]]).optional(),
 identity:z.enum(['new','team','customer']).optional(),name:z.string().trim().min(1).max(80).optional(),
 phone:z.string().regex(/^\+[1-9]\d{6,14}$/,'Enter your work WhatsApp number with its country code.').optional(),
 company_name:z.string().trim().min(1).max(80).optional(),country:z.string().refine(isCountry).optional(),region:z.string().trim().max(120).nullable().optional(),currency:z.string().refine(isCurrency).optional(),
 company_size:z.enum(['small','big']).optional(),trades:z.array(z.enum(TRADES)).min(1).optional(),working_days:z.array(z.number().int().min(0).max(6)).min(1).optional(),
 working_hours:z.object({start:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),end:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)}).strict().refine(v=>v.start<v.end,'Closing time must be after opening time.').optional(),
 invite_token:z.string().min(32).max(200).optional(),allow_different_email:z.boolean().optional(),workspace_id:z.uuid().optional(),
}).strict().superRefine((v,ctx)=>{if(v.region&&v.country&&!normalizeRegion(v.region,v.country))ctx.addIssue({code:'custom',path:['region'],message:'Choose a region from the list.'});});
export type OnboardingAnswers=z.infer<typeof onboardingAnswers>;
export function stepsFor(identity?:string){return identity==='team'||identity==='customer'?STEPS.filter(s=>!['company','country','region','currency','size','trades','days','hours'].includes(s)):STEPS;}
export function nextStep(step:OnboardingStep,identity?:string){const steps=stepsFor(identity);return steps[Math.min(steps.length-1,Math.max(0,steps.indexOf(step))+1)];}
export function validateStep(step:OnboardingStep,a:OnboardingAnswers){
 const fields:Partial<Record<OnboardingStep,(keyof OnboardingAnswers)[]>>={language:['language'],identity:['identity'],profile:['name','phone'],company:['company_name'],country:['country'],currency:['currency'],size:['company_size'],trades:['trades'],days:['working_days'],hours:['working_hours']};
 for(const key of fields[step]??[])if(a[key]===undefined)throw new Error('Please answer this question before continuing.');
 onboardingAnswers.parse(a);
}
export const inviteFromText=(value:string)=>{try{const url=new URL(value);return url.searchParams.get('token')??value.trim();}catch{return value.trim();}};
