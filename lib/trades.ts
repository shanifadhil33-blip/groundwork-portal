/** Trades a job can need and a worker can do. One word each, for readers with basic English. */
export const TRADES = ['electrical', 'plumbing', 'ac', 'carpentry', 'painting', 'cleaning', 'general'] as const;
export type Trade = typeof TRADES[number];
export const tradeLabels: Record<Trade, string> = { electrical: 'Electrical', plumbing: 'Plumbing', ac: 'AC', carpentry: 'Carpentry', painting: 'Painting', cleaning: 'Cleaning', general: 'General' };
