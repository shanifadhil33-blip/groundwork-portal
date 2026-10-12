import { endpoint } from '../../../../../lib/api';
import { scheduleBoard } from '../../../../../lib/services/schedule';
export const GET = endpoint(({ user, params, req }) => scheduleBoard(user, params.ws, new URL(req.url).searchParams), {});
