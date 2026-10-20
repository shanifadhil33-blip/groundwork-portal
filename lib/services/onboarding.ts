import { z } from 'zod';
import { withUser } from '../db';
import { ApiError,invalid } from '../http';
import { STEPS,nextStep,onboardingAnswers,validateStep,inviteFromText } from '../onboarding';
import { createWorkspace } from './workspaces';
import { patchPreferences,patchProfile } from './settings';
import { hash } from './shared';
import { currencyFor } from '../countries/rules';
import { assertRealUser } from './demo';
export async function getOnboarding(user:string){await assertRealUser(user);return withUser(user,async db=>{
 await db.query('INSERT INTO onboarding_progress(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user]);
 return (await db.query('SELECT * FROM onboarding_progress WHERE user_id=$1',[user])).rows[0];
});}
export async function saveOnboarding(user:string,body:unknown){
 await assertRealUser(user);const d=z.object({answers:onboardingAnswers,advance:z.boolean().default(false),back:z.boolean().default(false)}).strict().parse(body);
 return withUser(user,async db=>{
  await db.query('INSERT INTO onboarding_progress(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user]);
  const current=(await db.query('SELECT * FROM onboarding_progress WHERE user_id=$1 FOR UPDATE',[user])).rows[0];
  const proposed={...d.answers};delete proposed.workspace_id;
  const answers=onboardingAnswers.parse({...current.answers,...proposed});let step=current.step;
  if(d.advance){try{validateStep(step,answers);}catch(e){throw invalid(e instanceof Error?e.message:'Please check your answers.');}
   if(step==='language')await patchPreferences(user,{language:answers.language});
   if(step==='profile'){await patchProfile(user,{name:answers.name});await db.query('UPDATE users SET phone=$2 WHERE id=$1',[user,answers.phone]);}
   if(step==='invite'&&!answers.workspace_id){
    if(answers.identity==='new'){
     for(const s of STEPS.filter(s=>!['invite','done','region'].includes(s)))validateStep(s,answers);
     const workspace=await createWorkspace(user,{name:answers.company_name,country:answers.country,region:answers.region,currency:answers.currency??currencyFor(answers.country),company_size:answers.company_size},`onboarding:${user}`);answers.workspace_id=workspace.id;
     await db.query('UPDATE workspaces SET trades=$2,working_days=$3,working_hours=$4 WHERE id=$1',[workspace.id,answers.trades,answers.working_days,JSON.stringify(answers.working_hours)]);
    }else{
     if(!answers.invite_token)throw invalid('Ask your company for an invite link or code. Search helps you find the company name.');
     const joined=(await db.query('SELECT onboarding_accept_invite($1,$2) AS result',[hash(inviteFromText(answers.invite_token)),answers.allow_different_email??false])).rows[0].result;
     if(joined.error)throw new ApiError(409,joined.error,joined.error==='email_mismatch'?`You were invited as ${joined.email}. Choose Continue with this account, or ask for a new invite.`:'This invite is no longer available. Ask for a new invite.');answers.workspace_id=joined.workspace_id;
    }
   }
   step=nextStep(step,answers.identity);
  }
  if(d.back){const steps=STEPS.filter(s=>answers.identity==='new'||!['company','country','region','currency','size','trades','days','hours'].includes(s));step=steps[Math.max(0,steps.indexOf(step)-1)];}
  if(answers.invite_token&&answers.workspace_id)delete answers.invite_token;
  return (await db.query("UPDATE onboarding_progress SET answers=$2,step=$3,completed_at=CASE WHEN $3='done' THEN coalesce(completed_at,now()) ELSE completed_at END,updated_at=clock_timestamp() WHERE user_id=$1 RETURNING *",[user,JSON.stringify(answers),step])).rows[0];
 });
}
export async function onboardingInvite(user:string,value:string){await assertRealUser(user);return withUser(user,async db=>{const result=(await db.query('SELECT onboarding_invite_info($1) AS result',[hash(inviteFromText(value))])).rows[0].result;if(result.error)throw invalid('This invite is no longer available. Ask for a new invite.');return result;});}
export { searchCompanies as findCompany } from './company-listing';
export async function onboardingAcceptInvite(user:string,body:unknown){
 await assertRealUser(user);const d=z.object({token:z.string().min(32).max(200),allow_different_email:z.boolean().default(false)}).strict().parse(body);
 return withUser(user,async db=>{
  const result=(await db.query('SELECT onboarding_accept_invite($1,$2) AS result',[hash(d.token),d.allow_different_email])).rows[0].result;
  if(result.error)throw new ApiError(409,result.error,result.error==='email_mismatch'?`You were invited as ${result.email}. Choose Continue with this account, or ask for a new invite.`:'This invite is no longer available. Ask for a new invite.');
  // Bootstrap guided setup only for a person who has not started it. Existing progress is preserved.
  await db.query("INSERT INTO onboarding_progress(user_id,answers) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING",[user,JSON.stringify({identity:'team',workspace_id:result.workspace_id})]);
  return result;
 });
}
