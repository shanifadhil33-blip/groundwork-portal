import { endpoint } from '../../../../../../../lib/api';
import { saveJobReport } from '../../../../../../../lib/services/job-report';
export const POST = endpoint(({ user, params, body, key }) => saveJobReport(user, params.ws, params.id, body, key), { body: true });
