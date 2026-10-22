import { expect,it } from 'vitest';
import { usableReply } from '../lib/agent/reply-quality';
it.each([
 ['ar-AE','The most open jobs belong to علي.',false],['ar-AE','علي لديه خمسة أعمال مفتوحة. WO 12 Groundwork',true],
 ['hi','रवि के पास सबसे अधिक काम हैं।',true],['hi','अली has the most open jobs in the team.',false],
 ['ur','علی کے پاس پانچ کھلے کام ہیں۔',true],['ml','रवि के पास पाँच काम हैं।',false],
 ['fil','The technician has the most open jobs.',false],['fil','Siya ang may pinakamaraming bukas na trabaho.',true],
 ['sw-KE','Fundi huyu ana kazi nyingi zaidi.',true],['en-IN','The technician is not identified in the provided output.',false],
 ['en-IN','The visible jobs do not establish why the workload differs.',true],
])('validates %s prose', (language,text,ok)=>expect(usableReply(text,language)).toBe(ok));
