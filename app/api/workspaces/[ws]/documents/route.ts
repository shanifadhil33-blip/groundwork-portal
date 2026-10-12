import { endpoint } from '../../../../../lib/api';
import { addDocument, listDocuments } from '../../../../../lib/services/documents';
export const GET = endpoint(({ user, params, req }) => listDocuments(user, params.ws, new URL(req.url).searchParams), {});
export const POST = endpoint(({ user, params, body }) => addDocument(user, params.ws, body), { body: true, status: 201 });
