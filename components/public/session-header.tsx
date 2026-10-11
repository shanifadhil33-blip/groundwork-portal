import { getSessionUserId } from '../../lib/auth';
import { PublicHeader } from './chrome';
export async function SessionHeader(){return <PublicHeader signedIn={!!await getSessionUserId()}/>;}
