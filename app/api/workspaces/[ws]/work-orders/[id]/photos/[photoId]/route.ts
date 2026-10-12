import { endpoint, type RouteContext } from '../../../../../../../../lib/api';
import { requireUser } from '../../../../../../../../lib/auth';
import { errorResponse } from '../../../../../../../../lib/http';
import { getPhoto, removePhoto } from '../../../../../../../../lib/services/photos';
/** The photo bytes, private to people who can see the job. */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await requireUser(req), p = await ctx.params;
    const photo = await getPhoto(user, p.ws, p.id, p.photoId);
    return new Response(new Uint8Array(photo.bytes), { headers: { 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch (error) { return errorResponse(error); }
}
export const DELETE = endpoint(({ user, params }) => removePhoto(user, params.ws, params.id, params.photoId), {});
