'use client';
import { Card } from '../ui';
import { useResource } from './resource';
import type { CompanyHistory } from '../../lib/services/company-history';
const hours = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`; };
/** LEARN10: "From your company's history" on the job page, office only. Numbers come from this company's finished jobs. */
export function CompanyHistoryCard({ base, id }: { base: string; id: string }) {
 const h = useResource<CompanyHistory>(`${base}/work-orders/${id}/history`).data;
 if (!h) return null;
 return <Card className="stack company-history"><h2>From your company’s history</h2>
  {h.typical_minutes != null ? <p><span>Usual time</span>: <strong data-no-translate>{hours(h.typical_minutes)}</strong>. <span>Based on</span> <strong data-no-translate>{h.based_on}</strong> <span>finished jobs</span>.</p>
   : <p>Not enough finished jobs yet to say how long this takes.</p>}
  {h.site_repeat && <p><span>Same trade at this site, last six months</span>: <strong data-no-translate>{h.site_repeat.count}</strong> <span>finished jobs</span>{h.site_repeat.temporary > 0 && <>, <strong data-no-translate>{h.site_repeat.temporary}</strong> <span>temporary fixes</span></>}.</p>}
 </Card>;
}
