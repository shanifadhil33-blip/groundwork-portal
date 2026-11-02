import React from 'react';
import { lineDirection } from '../../lib/ui/text-direction';

/** Every line of a reply gets its own reading direction, so mixed lines such as "WO 31: ..." read naturally. */
export function DirectedLines({ text, render = t => t, className }: { text: string; render?: (text: string) => React.ReactNode; className?: string }) {
  return <>{text.split('\n').map((line, i) => line.trim()
    ? <span key={i} dir={lineDirection(line)} className={className ? `bidi-line ${className}` : 'bidi-line'}>{render(line)}</span>
    : <span key={i} className="bidi-gap" aria-hidden="true" />)}</>;
}
