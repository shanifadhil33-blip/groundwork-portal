/** Trades a job can need and a worker can do. One word each, for readers with basic English. */
export const TRADES = ['electrical', 'plumbing', 'ac', 'carpentry', 'painting', 'cleaning', 'general'] as const;
export type Trade = typeof TRADES[number];
export const tradeLabels: Record<Trade, string> = { electrical: 'Electric', plumbing: 'Plumbing', ac: 'AC', carpentry: 'Wood', painting: 'Paint', cleaning: 'Cleaning', general: 'General' };
