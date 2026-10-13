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
