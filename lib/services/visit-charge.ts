import { row, type Context } from './shared';
export type VisitCharge = { amount: number | null; currency: string; sample: boolean };
/** Site lookup keeps the usual workspace and client visibility checks. */
export async function visitChargeFor(c: Context, site_id: string | null): Promise<VisitCharge> {
 const site = site_id ? await row(c, 'sites', site_id) : null;
 const w = await row(c, 'workspaces', c.ws);
 const amount = (site?.region ? w.visit_charge_regions?.[site.region] : undefined) ?? w.visit_charge;
 return { amount: amount == null ? null : Number(amount), currency: w.currency, sample: w.visit_charge_sample };
}
