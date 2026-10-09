import { endpoint } from '../../../lib/api';
import { aiHealth } from '../../../lib/ai';
export const GET=endpoint(()=>aiHealth());
