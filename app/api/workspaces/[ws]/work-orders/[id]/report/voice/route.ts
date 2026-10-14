import { endpoint } from '../../../../../../../../lib/api';
import { voiceDraft } from '../../../../../../../../lib/services/job-report';
export const POST = endpoint(({ user, params, body }) => voiceDraft(user, params.ws, params.id, body), { body: true });
