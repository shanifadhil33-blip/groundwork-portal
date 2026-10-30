'use client';
import { Translated } from './app-words';
import { useApp } from './context';
import { LateJobs } from './owner-today';
import { LessonsWaiting } from './lessons-waiting';

export function OwnerAttention({ compact = false }: { compact?: boolean }) {
  const { member } = useApp();
  if (!member) return null;
  const base = `/api/workspaces/${member.workspace_id}`;
  return <Translated><section className="owner-home-aside" aria-label="Needs you"><LateJobs base={base} limit={compact?2:5}/><LessonsWaiting base={base}/></section></Translated>;
}
