'use client';
import * as React from 'react';
import type { ReactNode } from 'react';
type VTProps = { name: string; share?: string; default?: string; children: ReactNode };
// React's ViewTransition ships in the React that Next 16 bundles (canary); the types do not know it yet.
const VT = (React as unknown as { ViewTransition?: React.ComponentType<VTProps> }).ViewTransition;
/** Desert Stone: the job title travels from Home into the job page header (shared element). Without the API it is a plain render. */
export function JobTitleTransition({ id, children }: { id: string; children: ReactNode }) {
  if (!VT) return <>{children}</>;
  return <VT name={`job-${id}`} share="dsmorph" default="none">{children}</VT>;
}
