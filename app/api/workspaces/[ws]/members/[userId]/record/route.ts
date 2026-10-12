import { endpoint } from '../../../../../../../lib/api';
import { jobRecord } from '../../../../../../../lib/services/job-report';
export const GET = endpoint(({ user, params }) => jobRecord(user, params.ws, params.userId), {});
