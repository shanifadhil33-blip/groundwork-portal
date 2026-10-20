// WA02 hidden (scope cut, Adhil Oct 20 2026): no free WhatsApp provider yet, so the channel is switched off. The data and lib/services/channel.ts stay.
export const POST = async () => Response.json({ error: { code: 'removed', message: 'The WhatsApp channel is not switched on.' } }, { status: 410 });
