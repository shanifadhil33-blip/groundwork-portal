import { expect,it } from 'vitest';
import { personalAgentChatKey } from '../lib/ui/personal-agent';
it('chat history keys separate people and workspaces, including admin and technician',()=>{
 expect(personalAgentChatKey('Ravi','Company')).not.toBe(personalAgentChatKey('Imran','Company'));
 expect(personalAgentChatKey('Ravi','Company')).not.toBe(personalAgentChatKey('Ravi','Other company'));
 expect(personalAgentChatKey('Ravi','Company')).toBe(personalAgentChatKey('Ravi','Company'));
});
