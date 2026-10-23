import { endpoint } from '../../../../../lib/api';
import { listCompanyMemory } from '../../../../../lib/services/company-memory';
export const GET = endpoint(({ user, params }) => listCompanyMemory(user, params.ws));
