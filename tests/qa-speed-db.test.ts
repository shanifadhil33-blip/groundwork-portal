import { beforeEach, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({pools:[] as {options:Record<string,unknown>;connect:ReturnType<typeof vi.fn>}[],queries:[] as {sql:string;values?:unknown[]}[]}));
vi.mock('../lib/env',()=>({requiredEnv:(name:string)=>name}));
vi.mock('pg',()=>({types:{setTypeParser:vi.fn()},Pool:class {
 options:Record<string,unknown>;connect=vi.fn(async()=>({query:vi.fn(async(sql:string,values?:unknown[])=>{mock.queries.push({sql,values});return {rows:[]};}),release:vi.fn()}));end=vi.fn();
 constructor(options:Record<string,unknown>){this.options=options;mock.pools.push(this);}
}}));
import { appPool, ownerPool, asAgent, withUser, withSystem } from '../lib/db';
const user='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{mock.queries.length=0;for(const pool of mock.pools)pool.connect.mockClear();});
it('limits serverless pools and keeps runtime/app and owner credentials separate',()=>{
 expect(appPool.options).toMatchObject({max:4,idleTimeoutMillis:10000,connectionTimeoutMillis:5000,keepAlive:true,connectionString:'TEST_DATABASE_URL'});
 expect(ownerPool.options).toMatchObject({connectionString:'TEST_DATABASE_URL_OWNER'});
});
it('sets user and agent attribution together and reuses nested app-role transactions',async()=>{
 await asAgent({kind:'agent',tokenId:'token'},()=>withUser(user,async db=>{await db.query('SELECT outer_read');await withUser(user,async nested=>{expect(nested).toBe(db);await nested.query('SELECT nested_read');});}));
 expect(mock.pools[0].connect).toHaveBeenCalledTimes(1);
 const configurations=mock.queries.filter(q=>q.sql.includes('set_config'));
 expect(configurations).toHaveLength(1);expect(configurations[0].values).toEqual([user,'agent','token']);
 expect(mock.queries.map(q=>q.sql)).toEqual(['BEGIN',configurations[0].sql,'SELECT outer_read','SELECT nested_read','COMMIT']);
});
it('never reuses an attributed owner connection for a nested tenant read',async()=>{
 await withSystem(async owner=>{await withUser(user,async app=>{expect(app).not.toBe(owner);});},user);
 expect(mock.pools[0].connect).toHaveBeenCalledTimes(1);expect(mock.pools[1].connect).toHaveBeenCalledTimes(1);
 expect(mock.queries.filter(q=>q.sql.includes('set_config'))).toHaveLength(2);
});
it('rolls back and releases failed transactions',async()=>{
 await expect(withUser(user,async()=>{throw new Error('failed');})).rejects.toThrow('failed');
 expect(mock.queries.map(q=>q.sql)).toContain('ROLLBACK');expect(mock.queries.map(q=>q.sql)).not.toContain('COMMIT');
});
