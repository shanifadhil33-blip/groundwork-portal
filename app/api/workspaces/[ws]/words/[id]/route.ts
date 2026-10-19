import { endpoint } from '../../../../../../lib/api';
import { deleteWord } from '../../../../../../lib/services/agent-words';
export const DELETE=endpoint(({user,params})=>deleteWord(user,params.ws,params.id));
