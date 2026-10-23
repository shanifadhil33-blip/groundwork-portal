import { endpoint } from '../../../../../../lib/api';
import { correctCompanyMemory, deleteCompanyMemory } from '../../../../../../lib/services/company-memory';
export const PATCH = endpoint(({ user, params, body }) => correctCompanyMemory(user, params.ws, params.id, body), { body: true });
export const DELETE = endpoint(({ user, params }) => deleteCompanyMemory(user, params.ws, params.id));
