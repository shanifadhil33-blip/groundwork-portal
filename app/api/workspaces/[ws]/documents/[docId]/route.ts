import { endpoint } from '../../../../../../lib/api';
import { patchDocument, removeDocument } from '../../../../../../lib/services/documents';
export const PATCH = endpoint(({ user, params, body }) => patchDocument(user, params.ws, params.docId, body), { body: true });
export const DELETE = endpoint(({ user, params }) => removeDocument(user, params.ws, params.docId), {});
// Archive hidden (scope cut, Adhil Oct 20 2026).
export const POST = async () => Response.json({ error: { code: 'removed', message: 'That is not part of Groundwork. Nothing was changed.' } }, { status: 410 });

