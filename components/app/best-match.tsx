'use client';
import { ContactName } from './contact-name';
import { Button } from '../ui';
import { tradeLabels, type Trade } from '../../lib/trades';
import { useResource } from './resource';

type Worker = { user_id: string; name: string | null; trade_match: boolean; area_match: boolean; today: number; off?: string | null };
type Suggest = { trade: Trade | null; area: string | null; workers: Worker[] };

/** One line, one button: who fits this job best by trade, then area, then fewest jobs today. */
export function BestMatch({ base, id, version, current, busy, onAssign }: { base: string; id: string; version: string; current: string | null; busy: boolean; onAssign: (userId: string) => void }) {
  const s = useResource<Suggest>(`${base}/work-orders/${id}/suggest?v=${encodeURIComponent(version)}`);
  if (s.loading || s.error || !Array.isArray(s.data?.workers)) return null;
  const data = s.data as Suggest, best = data.workers.find(w => !w.off);
  if (!best) return <p className="small muted">{data.workers.length ? 'Everyone on the team is off that day. Pick another day.' : 'Add a technician on the Team page to assign this job.'}</p>;
  if (!data.trade && !data.area) return <p className="small muted">Pick a trade for this job to see who fits best.</p>;
  if (!best.trade_match && !best.area_match) return <p className="small muted">Nobody on the team has this trade or area yet. Set them on the Team page.</p>;
  const why = [best.trade_match && data.trade ? tradeLabels[data.trade] : null, best.area_match ? data.area : null, `${best.today} today`].filter(Boolean).join(' · ');
  const name = best.name ?? 'Team member';
  return <div className="best-match"><div><strong>Best for this job: <ContactName name={name} userId={best.user_id}/></strong><p className="small">{why}</p></div>
    {best.user_id === current ? <span className="small">Assigned</span> : <Button variant="secondary" busy={busy} onClick={() => onAssign(best.user_id)}>Assign {name}</Button>}</div>;
}
