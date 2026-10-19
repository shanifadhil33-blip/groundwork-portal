import { endpoint } from '../../../../../lib/api';
import { myFixes } from '../../../../../lib/services/job-report';
export const GET = endpoint(({ user, params, req }) => {
  const q = new URL(req.url).searchParams;
  return myFixes(user, params.ws, { month: (q.get('month') ?? 'this') as 'this' | 'last' | 'all', q: q.get('q') ?? '', page: Number(q.get('page') ?? 1), ...(q.has('of') ? { of: q.get('of')! } : {}) });
});
