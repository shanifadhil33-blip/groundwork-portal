import { requireUser } from './auth';
import { exportCompanyData, exportPersonalData } from './services/data-protection';
import { ApiError, errorResponse } from './http';
import { z } from 'zod';
export async function dataDownload(req: Request, ws?: string) {
  try {
    const user = await requireUser(req);
    if (req.headers.get('groundwork-user') && req.headers.get('groundwork-user') !== user) throw new ApiError(409, 'account_changed', 'Your account changed. Refresh before downloading.');
    const scope = z.enum(['personal','company']).parse(new URL(req.url).searchParams.get('scope') ?? 'personal');
    if (scope === 'company' && !ws) throw new ApiError(422, 'workspace_required', 'Choose a company before exporting company data.');
    const data = scope === 'company' && ws ? await exportCompanyData(user, ws) : await exportPersonalData(user, ws);
    return Response.json(data, { headers: {
      'Content-Disposition':'attachment; filename="groundwork_data.json"',
      'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff',
    } });
  } catch (error) { return errorResponse(error); }
}
