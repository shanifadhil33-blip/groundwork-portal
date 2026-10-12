import { endpoint } from '../../../../../../../lib/api';
import { saveJobReport } from '../../../../../../../lib/services/job-report';
export const POST = endpoint(({ user, params, body }) => saveJobReport(user, params.ws, params.id, body), { body: true });
