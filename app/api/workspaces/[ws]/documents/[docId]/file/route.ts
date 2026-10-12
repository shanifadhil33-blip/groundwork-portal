import { type RouteContext } from '../../../../../../../lib/api';
import { requireUser } from '../../../../../../../lib/auth';
import { errorResponse } from '../../../../../../../lib/http';
import { getDocumentFile } from '../../../../../../../lib/services/documents';
/** The file itself, private to admins and supervisors. Opens in the browser; never runs as a page. */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await requireUser(req), p = await ctx.params;
    const f = await getDocumentFile(user, p.ws, p.docId);
    const name = f.file_name.replace(/[^\w. ()]+/g, '_');
    return new Response(new Uint8Array(f.bytes), { headers: { 'Content-Type': f.mime, 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', ...(f.mime === 'application/pdf' ? {} : { 'Content-Security-Policy': "default-src 'none'" }) } });
  } catch (error) { return errorResponse(error); }
}
