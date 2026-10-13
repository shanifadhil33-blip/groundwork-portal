import { expect, it } from 'vitest';
import { suggestionInput } from '../lib/services/suggestions';
import { notificationMessage } from '../lib/ui/notifications';
it('validates suggestion text and uses safe defaults',()=>{
 expect(suggestionInput.parse({title:' Tap leaks '})).toMatchObject({title:'Tap leaks',problem:'',priority:'normal',photo_ids:[]});
 expect(suggestionInput.safeParse({title:' ',sender_user_id:'spoof'}).success).toBe(false);
 expect(suggestionInput.safeParse({title:'Tap',priority:'fake'}).success).toBe(false);
});
it('bell explains the suggestion and decision',()=>{
 expect(notificationMessage({kind:'suggestion_received',actor_name:'Ravi',work_order_title:'Tap'})).toContain('Ravi suggested Tap');
 expect(notificationMessage({kind:'suggestion_decided',to_status:'declined'})).toContain('not accepted');
});
it('Agent suggestion writes have clear confirmation and result text',async()=>{
 const {actionSummary,actionResult}=await import('../lib/ui/assistant-replies');
 const {allowedTool}=await import('../lib/agent/role-tools');
 expect(actionSummary('approve_suggestion',{id:'x'},null,'Tap')).toContain('Approve Tap and create a job');
 expect(actionSummary('decline_suggestion',{reason:'Wrong site'},null,'Tap')).toContain('Reason: Wrong site');
 expect(actionResult('suggest_job',{})).toContain('for review');
 expect(allowedTool('technician','suggest_job')).toBe(true);expect(allowedTool('technician','approve_suggestion')).toBe(false);expect(allowedTool('office','decline_suggestion')).toBe(false);
});
it('connection notifications explain the receiving action',()=>{
 expect(notificationMessage({kind:'job_assigned',actor_name:'Sam',work_order_title:'Valve'})).toBe('Sam assigned Valve to you.');
 expect(notificationMessage({kind:'comment_added',to_status:'internal',actor_name:'Sam',work_order_title:'Valve'})).toContain('internal note');
 expect(notificationMessage({kind:'roles_changed'})).toContain('changed your roles');
});
