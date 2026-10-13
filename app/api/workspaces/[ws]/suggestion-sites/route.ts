import { endpoint } from '../../../../../lib/api';
import { inWorkspace } from '../../../../../lib/services/shared';
export const GET=endpoint(({user,params})=>inWorkspace(user,params.ws,async c=>(await c.db.query('SELECT s.id,s.client_id,s.name,cl.name AS client_name FROM sites s JOIN clients cl ON cl.id=s.client_id AND cl.workspace_id=s.workspace_id WHERE s.workspace_id=$1 AND s.archived_at IS NULL AND cl.archived_at IS NULL ORDER BY cl.name,s.name',[params.ws])).rows));
