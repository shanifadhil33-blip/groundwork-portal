import { endpoint } from '../../../../lib/api';
import { readUsual, saveUsual } from '../../../../lib/services/planned';
export const GET = endpoint(({ user }) => readUsual(user));
export const PUT = endpoint(({ user, body }) => saveUsual(user, body), { body: true });
