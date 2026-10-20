import { z } from 'zod';
import { endpoint } from '../../../../../../../lib/api';
import { getJobClose, keepDraft, markNoPhotos, signOffJob, thankJob } from '../../../../../../../lib/services/job-close';

const body = z.object({
  action: z.enum(['sign_off', 'no_photos', 'keep_draft', 'thanks']),
  stars: z.number().int().min(1).max(5).optional(),
  thanks: z.string().trim().max(200).optional(),
}).strict();
export const GET = endpoint(({ user, params }) => getJobClose(user, params.ws, params.id));
export const POST = endpoint(async ({ user, params, body: input }) => {
  const d = body.parse(input);
  if (d.action === 'sign_off') return signOffJob(user, params.ws, params.id, { stars: d.stars, thanks: d.thanks });
  if (d.action === 'thanks') return thankJob(user, params.ws, params.id, { stars: d.stars, thanks: d.thanks });
  if (d.action === 'no_photos') return markNoPhotos(user, params.ws, params.id);
  return keepDraft(user, params.ws, params.id);
}, { body: true });
