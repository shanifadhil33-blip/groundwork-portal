import { endpoint } from '../../../../../../lib/api';
import { leaveRequests, requestTimeOff } from '../../../../../../lib/services/time-off';
export const GET = endpoint(({ user, params }) => leaveRequests(user, params.ws), {});
export const POST = endpoint(({ user, params, body }) => requestTimeOff(user, params.ws, body), { body: true, status: 201 });
