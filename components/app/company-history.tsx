'use client';
import { useEffect, useRef, useState } from 'react';
import { Card } from '../ui';
import { useResource } from './resource';
import type { CompanyHistory } from '../../lib/services/company-history';
/** Numbers stay as written; the units are interface words, so every language translates them. */
const Hours = ({ m }: { m: number }) => { const h = Math.floor(m / 60), r = m % 60; return <>{h > 0 && <><span data-no-translate>{h}</span> <span>hr</span></>}{h > 0 && r > 0 && ' '}{(r > 0 || h === 0) && <><span data-no-translate>{r}</span> <span>min</span></>}</>; };
/** LEARN10: "From your company's history" on the job page, office only. Numbers come from this company's finished jobs. */
export function CompanyHistoryCard({ base, id }: { base: string; id: string }) {
 // DEMO12: "Demo: before and after learning" opens the job with ?learning=1 to show both side by side.
 const [learning, setLearning] = useState(false);
 useEffect(() => { setLearning(new URLSearchParams(window.location.search).get('learning') === '1'); }, []);
 const h = useResource<CompanyHistory>(`${base}/work-orders/${id}/history`).data;
 const [flipped, setFlipped] = useState(false), moved = useRef(false), frontBtn = useRef<HTMLButtonElement|null>(null), backBtn = useRef<HTMLButtonElement|null>(null);
 useEffect(() => { if (moved.current) (flipped ? backBtn : frontBtn).current?.focus({ preventScroll: true }); }, [flipped]);
 const flip = (v: boolean) => { moved.current = true; setFlipped(v); };
 if (!h) return null;
 const after = <>{h.typical_minutes != null ? <p><span>Usual time</span>: <strong><Hours m={h.typical_minutes} /></strong>. <span>Based on</span> <strong data-no-translate>{h.based_on}</strong> <span>finished jobs</span>.</p>
   : <p>Not enough finished jobs yet to say how long this takes.</p>}
  {h.site_repeat && <p><span>Same trade at this site, last six months</span>: <strong data-no-translate>{h.site_repeat.count}</strong> <span>finished jobs</span>{h.site_repeat.temporary > 0 && <>, <strong data-no-translate>{h.site_repeat.temporary}</strong> <span>temporary fixes</span></>}.</p>}</>;
 // DEMO12 demo link keeps both side by side; otherwise the card flips between after and before learning (one flip on this screen).
 if (learning) return <Card className="stack company-history"><h2>From your company’s history</h2>
  <div className="stack learning-before" data-learning="before"><h3>Before learning</h3><p>A new company with no finished jobs.</p><p>Not enough finished jobs yet to say how long this takes.</p><h3>After learning</h3><p>This company, from its own finished jobs.</p></div>{after}</Card>;
 return <section className="company-history flip" data-flipped={flipped} aria-labelledby="company-history-h"><div className="flip-inner">
  <div className="flip-face flip-front ds-panel stack compact" inert={flipped} aria-hidden={flipped}><h2 id="company-history-h">From your company’s history</h2><p className="ds-sub">After learning</p>{after}
   <button type="button" ref={frontBtn} className="ds-flip-btn ds-flip-light" aria-pressed={false} aria-controls="company-history-back" onClick={() => flip(true)}>Before learning</button></div>
  <div id="company-history-back" className="flip-face flip-back ds-panel stack compact" inert={!flipped} aria-hidden={!flipped}><h2>Before learning</h2><p>A new company with no finished jobs.</p><p>Not enough finished jobs yet to say how long this takes.</p>
   <button type="button" ref={backBtn} className="ds-flip-btn ds-flip-light" aria-pressed={true} aria-controls="company-history-back" onClick={() => flip(false)}>Flip back</button></div>
 </div></section>;
}
