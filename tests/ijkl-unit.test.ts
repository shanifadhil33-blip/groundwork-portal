import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { customerRoleLabel,rolesLabel } from '../lib/roles';
import { sizeRoles,menuEnabled,companyOptions } from '../lib/company';
import { personalNames,type Contact } from '../lib/contact-names';
import { onboardingAnswers,nextStep,stepsFor,validateStep,inviteFromText } from '../lib/onboarding';
import { currencyFor } from '../lib/countries/rules';
import { z } from 'zod';
const read=(p:string)=>readFileSync(p,'utf8');
const contacts:Contact[]=[{user_id:'sam',real_name:'Sam',nickname:'Sam at Tower 3',name:'Sam at Tower 3'}];
describe('Customer labels follow permissions',()=>{
 it('keeps maintenance Office staff distinct from facility contacts',()=>{
  expect(customerRoleLabel('manager')).toBe('Client manager');expect(customerRoleLabel('office')).toBe('Client staff');expect(customerRoleLabel('household')).toBe('Home client');
  expect(rolesLabel({role:'client',client_kind:'office'})).toBe('Client staff');expect(rolesLabel({role:'staff',staff_kind:'office'})).toBe('Office staff');
  const picker=read('components/public/demo-picker.tsx');expect(picker).toContain("name: 'Pranav', group: 'client_manager'");expect(picker).toContain("name: 'Kevin', group: 'client_staff'");expect(picker).toContain("name: 'Nabil', group: 'office'");
 });
});
describe('Viewer names',()=>{
 it('personalizes identities without changing message bodies or company names',()=>{
  const source={sender_id:'sam',sender_name:'Sam',body:'Sam said hello',client:{name:'Sam'},assignee:{id:'sam',name:'Sam'},data:[{user_id:'sam',name:'Sam'}]};
  const renamed=personalNames(source,contacts);expect(renamed.sender_name).toBe('Sam at Tower 3');expect(renamed.assignee.name).toBe('Sam at Tower 3');expect(renamed.data[0].name).toBe('Sam at Tower 3');expect(renamed.body).toBe('Sam said hello');expect(renamed.client.name).toBe('Sam');expect(source.sender_name).toBe('Sam');expect(personalNames(source,[])).toEqual(source);
 });
 it('uses the same identity handling for team messages and job events',()=>{expect(personalNames({actor_id:'sam',actor_name:'Sam'},contacts)).toMatchObject({actor_name:'Sam at Tower 3',actor_name_real:'Sam'});});
 it('has private SQL policies, name bounds, confirmation enforcement and a real name control',()=>{
  const migration=read('db/migrations/0040_contact_nicknames.sql');expect(migration).toContain('PRIMARY KEY(owner_user_id,target_user_id)');expect(migration).toContain('BETWEEN 1 AND 60');expect(migration).toContain('FORCE ROW LEVEL SECURITY');expect(migration).toContain('owner_user_id=app_user_id()');
  expect(read('lib/agent/tools.ts')).toContain("['suggest_contact_name','fill_onboarding'].includes(name)&&!c.approved");
  expect(read('components/app/contact-name.tsx')).not.toContain('Save as...');expect(read('components/app/contact-names-context.tsx')).toContain('groundwork-contact-names');
 });
});
describe('Company size',()=>{
 it('adds worker rights to each small company owner and removes only automatically added roles',()=>{
  const small=sizeRoles(['staff'],[],'small');expect(small).toEqual({extra_roles:['staff','technician'],size_added_roles:['technician']});
  expect(sizeRoles(small.extra_roles,small.size_added_roles,'big')).toEqual({extra_roles:['staff'],size_added_roles:[]});
  expect(sizeRoles(['staff','technician'],[],'big').extra_roles).toEqual(['staff','technician']);
  expect(sizeRoles(small.extra_roles,small.size_added_roles,'small')).toEqual(small);
 });
 it('shows owner and manager labels while preserving the permission role',()=>{expect(rolesLabel({role:'admin',is_owner:true})).toBe('Owner');expect(rolesLabel({role:'staff',is_manager:true})).toBe('Supervisor');});
 it('hides unused screens, keeps required roles and validates company size',()=>{
  expect(menuEnabled('/schedule',['work'])).toBe(false);expect(menuEnabled('/settings',['work'])).toBe(true);
  expect(z.object(companyOptions).safeParse({enabled_roles:['technician']}).success).toBe(false);
  expect(z.object(companyOptions).safeParse({company_size:'small',enabled_roles:['owner','admin','technician'],enabled_dashboards:['overview']}).success).toBe(true);
 });
});
describe('Saved setup',()=>{
 it('asks one question at a time and skips company questions for people joining',()=>{
  expect(nextStep('language')).toBe('identity');expect(nextStep('profile','new')).toBe('company');expect(nextStep('profile','team')).toBe('invite');expect(nextStep('profile','customer')).toBe('invite');expect(stepsFor('customer')).not.toContain('currency');
 });
 it('accepts partial answers for resume but requires the current answer to continue',()=>{
  expect(onboardingAnswers.parse({language:'en-IN'})).toEqual({language:'en-IN'});expect(()=>validateStep('profile',{name:'Bilal'})).toThrow();expect(()=>validateStep('profile',{name:'Bilal',phone:'+971501234567'})).not.toThrow();
  expect(onboardingAnswers.safeParse({phone:'0501234567'}).success).toBe(false);expect(onboardingAnswers.safeParse({working_hours:{start:'17:00',end:'08:00'}}).success).toBe(false);expect(onboardingAnswers.safeParse({country:'AE',region:'London'}).success).toBe(false);
 });
 it('defaults currency from country and accepts an invite link or code',()=>{expect(currencyFor('AE')).toBe('AED');expect(inviteFromText('https://example.test/invites/accept?token=abc')).toBe('abc');expect(inviteFromText('abc')).toBe('abc');});
 it('never trusts a proposed workspace id and supports leaving setup',()=>{
  expect(read('lib/services/onboarding.ts')).toContain('delete proposed.workspace_id');expect(read('components/app/guided-onboarding.tsx')).toContain('Do this later');expect(read('components/app/shell.tsx')).not.toContain("if (member && path === '/onboarding') router.replace(home)");
 });
 it('offers explicit invite email handling and never merges a duplicate company',()=>{
  expect(read('db/migrations/0042_onboarding_progress.sql')).toContain('AND NOT allow_different_email');expect(read('components/app/guided-onboarding.tsx')).toContain('You were invited as');expect(read('lib/services/workspaces.ts')).toContain("'company_exists'");expect(read('lib/services/workspaces.ts')).toContain('pg_advisory_xact_lock');
 });
});
