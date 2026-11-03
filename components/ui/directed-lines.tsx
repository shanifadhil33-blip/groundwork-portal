import React from 'react';
import { lineDirection } from '../../lib/ui/text-direction';

/** A reply line for one job: "WO 31: ...", optionally after a bullet such as "• " or "- ". */
export const isJobLine = (line: string) => /^\s*(?:[•·*-]\s*)?\[?WO \d+\b/.test(line);

/**
 * Every line of a reply gets its own reading direction, so mixed lines such as "WO 31: ..." read naturally.
 * Job lines are marked with data-wo so the chat bubbles can space them apart on small phones (Nov 3: a late jobs
 * reply ran its jobs together at 360px). The gap is CSS only; the reply text keeps no blank lines.
 */
export function DirectedLines({ text, render = t => t, className }: { text: string; render?: (text: string) => React.ReactNode; className?: string }) {
  return <>{text.split('\n').map((line, i) => line.trim()
    ? <span key={i} dir={lineDirection(line)} className={className ? `bidi-line ${className}` : 'bidi-line'} data-wo={isJobLine(line) ? '' : undefined}>{render(line)}</span>
    : <span key={i} className="bidi-gap" aria-hidden="true" />)}</>;
}
