import { z } from 'zod';
import { TRADES, type Trade } from './trades';

export const templateInput = z.object({ trade: z.enum(TRADES), steps: z.array(z.string().trim().min(1).max(80)).max(12).refine(v => new Set(v.map(s => s.toLowerCase())).size === v.length) }).strict();
export const materialInput = z.object({ name: z.string().trim().min(1).max(80), quantity: z.number().positive().max(100000), note: z.string().trim().max(200).optional() }).strict();
export const progressInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('tick'), step: z.string().trim().min(1).max(80), done: z.boolean() }).strict(),
  z.object({ action: z.literal('add_material'), ...materialInput.shape }).strict(),
  z.object({ action: z.literal('remove_material'), material_id: z.uuid() }).strict(),
]);
export type JobChecklist = { steps: { name: string; done: boolean }[]; materials: { id: string; name: string; quantity: number; note?: string }[] };
export const CHECKLIST_DEFAULTS: Partial<Record<Trade, string[]>> = {
  ac: ['Clean the filter', 'Check the drain', 'Check cooling', 'Check for leaks', 'Clean the work area'],
  plumbing: ['Check for leaks', 'Check water flow', 'Test the repair', 'Clean the work area'],
  electrical: ['Switch off the power', 'Check the wiring', 'Test the repair', 'Clean the work area'],
};
export const emptyChecklist = (steps: string[]): JobChecklist => ({ steps: steps.map(name => ({ name, done: false })), materials: [] });
