import { expect, it } from 'vitest';
import { plainJobWording } from '../lib/ui/job-wording';
import { plainAssistantReply } from '../lib/ui/assistant-replies';
import { renderNotification } from '../lib/ui/notifications';
it('cleans old job labels in saved replies without changing job numbers or names', () => {
 expect(plainAssistantReply('WO 25 is late. WO-31 is assigned to Imran.')).toBe('Job #25 is late. Job #31 is assigned to Imran.');
 expect(plainJobWording('WO 31 متأخرة','ar-AE')).toBe('مهمة #31 متأخرة');
});
it('cleans saved notification values and fallback bodies in English and Arabic', () => {
 const message={key:'{body}',values:{body:'WO 25, WO-31'}};
 expect(renderNotification(message,{},'en-IN')).toBe('Job #25, Job #31');
 expect(renderNotification(message,{},'ar-AE')).toBe('مهمة #25, مهمة #31');
});
