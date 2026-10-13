import { expect,it } from 'vitest';
import { allowedTool } from '../lib/agent/role-tools';
import { notificationMessage } from '../lib/ui/notifications';
it('Team space is limited to the company and uses plain bell copy',()=>{
 expect(allowedTool('client:manager','list_team_messages')).toBe(false);expect(allowedTool('client:household','send_team_message')).toBe(false);expect(allowedTool('technician','list_team_messages')).toBe(true);expect(allowedTool('office','send_team_message')).toBe(true);
 expect(notificationMessage({kind:'team_message',actor_name:'Sam'})).toBe('Sam wrote in Team space.');
});
