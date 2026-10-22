'use client';
import { useContext } from 'react';
import { AppContext } from './context';
import { DEMO_DECISION_COPY } from '../../lib/demo-decision-copy';

/** Only known sandbox copy enters the static language file translator. */
export function DemoDecisionText({ text }: { text: string }) {
  const app = useContext(AppContext);
  const sample = app?.workspace?.is_demo && Object.values(DEMO_DECISION_COPY).some(value => value === text);
  return <span data-no-translate={sample ? undefined : true}>{text}</span>;
}
