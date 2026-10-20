import { z } from 'zod';
import { endpoint } from '../../../../../../../lib/api';
import { getJobClose, keepDraft, markNoPhotos, signOffJob } from '../../../../../../../lib/services/job-close';

const body = z.object({ action: z.enum(['sign_off', 'no_photos', 'keep_draft']) }).strict();
export const GET = endpoint(({ user, params }) => getJobClose(user, params.ws, params.id));
export const POST = endpoint(async ({ user, params, body: input }) => {
  const d = body.parse(input);
  if (d.action === 'sign_off') return signOffJob(user, params.ws, params.id);
  if (d.action === 'no_photos') return markNoPhotos(user, params.ws, params.id);
  return keepDraft(user, params.ws, params.id);
}, { body: true });
