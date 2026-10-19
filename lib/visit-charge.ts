import type { VisitCharge } from './services/visit-charge';
export function visitChargeText(charge?: VisitCharge) {
 return charge?.amount == null ? 'The office will confirm the price.' : `${charge.currency} ${charge.amount.toFixed(2)}${charge.sample ? ' (Sample price)' : ''}`;
}
