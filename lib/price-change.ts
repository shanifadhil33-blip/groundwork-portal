export type PriceChange = { state:'waiting_price'|'pending'|'approved'|'declined'|'refused'; words:string; technician_name:string; refusal_words?:string; visit_charge?:number|null; currency?:string };
export const PRICE_HOLD = 'Work is on hold until the client approves the price.';
export const priceHeld = (change:PriceChange|null|undefined) => !!change && ['waiting_price','pending','declined'].includes(change.state);
export const priceChangeLabel = (change:PriceChange) => ({waiting_price:'Waiting for a price',pending:'Waiting for the client',approved:'Price approved',declined:'Client said no',refused:'Client refused'})[change.state];
