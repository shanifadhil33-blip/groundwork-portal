// Nov 23 archives hidden (scope cut, Adhil Oct 20 2026). lib/services/archives.ts and the data stay.
export const POST = async () => Response.json({ error: { code: 'removed', message: 'That is not part of Groundwork. Nothing was changed.' } }, { status: 410 });
