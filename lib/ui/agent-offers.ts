/** A refused change can be sent to the existing supervisor question queue. */
export type RefusalOffer = { to_name: string; label: string; question: string; proposed: string; work_order_id?: string };
