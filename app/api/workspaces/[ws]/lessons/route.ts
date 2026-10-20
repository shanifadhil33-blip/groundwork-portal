import { endpoint } from '../../../../../lib/api';
import { listLessons } from '../../../../../lib/services/lessons';
export const GET=endpoint(({user,params})=>listLessons(user,params.ws));
