import { endpoint } from '../../../../../../../lib/api';
import { addPhoto, listPhotos } from '../../../../../../../lib/services/photos';
export const GET = endpoint(({ user, params }) => listPhotos(user, params.ws, params.id), {});
export const POST = endpoint(({ user, params, body }) => addPhoto(user, params.ws, params.id, body), { body: true, status: 201 });
