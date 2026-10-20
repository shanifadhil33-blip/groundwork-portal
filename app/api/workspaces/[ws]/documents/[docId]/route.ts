import { endpoint } from '../../../../../../lib/api';
import { archiveDocument } from '../../../../../../lib/services/archives';
import { patchDocument, removeDocument } from '../../../../../../lib/services/documents';
export const PATCH = endpoint(({ user, params, body }) => patchDocument(user, params.ws, params.docId, body), { body: true });
export const DELETE = endpoint(({ user, params }) => removeDocument(user, params.ws, params.docId), {});
export const POST = endpoint(({ user, params }) => archiveDocument(user, params.ws, params.docId));

