import { endpoint } from '../../../../../../lib/api';
import { patchDocument, removeDocument } from '../../../../../../lib/services/documents';
export const PATCH = endpoint(({ user, params, body }) => patchDocument(user, params.ws, params.docId, body), { body: true });
export const DELETE = endpoint(({ user, params }) => removeDocument(user, params.ws, params.docId), {});
