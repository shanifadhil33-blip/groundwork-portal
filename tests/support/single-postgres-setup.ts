import { Pool,stop } from './single-postgres.mjs';
import { migrate } from '../../scripts/migrate';
export default async function setup(){
 if(!process.env.SINGLE_PG_DIR?.startsWith('/tmp/portal-hero-test-pg'))throw new Error('Use only the temporary test cluster');
 const pool=new Pool({connectionString:'postgresql://box@local/postgres'}),c=await pool.connect();
 try{await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');await migrate(c as any);}finally{c.release();await stop();}
}
