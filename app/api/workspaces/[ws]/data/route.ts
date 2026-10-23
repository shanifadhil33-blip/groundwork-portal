import { dataDownload } from '../../../../../lib/data-download';
import type { RouteContext } from '../../../../../lib/api';
export async function GET(req: Request, context: RouteContext) {
  return dataDownload(req, (await context.params).ws);
}
