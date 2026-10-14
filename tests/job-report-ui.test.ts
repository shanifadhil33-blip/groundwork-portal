import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const read=(p:string)=>readFileSync(p,'utf8');
it('the job report never picks an outcome for the technician',()=>{const s=read('components/app/my-day.tsx');expect(s).toContain('outcome:null as Outcome|null');expect(s).toContain('disabled={!outcome}');expect(s).not.toContain("outcome:'fixed' as Outcome");});
it('Complete job on the job page opens the structured job report for technicians',()=>{const s=read('components/app/work-order-detail.tsx');expect(s).toContain("o.status==='in_progress'?setReporting(true)");expect(s).toContain('<DoneDialog');});
