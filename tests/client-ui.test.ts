import { describe, expect, it } from 'vitest';
import { clientEvent, clientStatusLabels, providerOnlyPath, visibleComments } from '../lib/ui/work-orders';
import { requestSites } from '../lib/services/clients';
import { ids } from '../scripts/seed';
import type { Comment, Detail } from '../lib/ui/work-orders';
describe('client presentation and lookups',()=>{
 it('uses client wording without exposing raw timeline bodies or internal comments',()=>{
  expect(clientStatusLabels.waiting_on_parts).toBe('Waiting on Parts');
  const comments=[{visibility:'internal',body:'Private note'},{visibility:'client',body:'Public update'}] as Comment[];
  expect(visibleComments(comments,true).map(c=>c.body)).toEqual(['Public update']);
  expect(visibleComments(comments,false)).toHaveLength(2);
  expect(clientEvent({kind:'assignment',body:'Private operational detail'} as Detail['timeline'][number])).toBe('Request updated');
  expect(clientEvent({to_status:'done'} as Detail['timeline'][number])).toBe('Completed');
 });
 it('guards provider paths and allows client navigation',()=>{
  for(const path of ['/dashboard','/import','/imports/123','/queue','/supplier/orders','/clients/123','/audit','/work-orders/123/edit'])expect(providerOnlyPath(path)).toBe(true);
  for(const path of ['/home','/work-orders','/work-orders/new','/work-orders/123','/isolation','/settings'])expect(providerOnlyPath(path)).toBe(false);
 });
 it('loads only the current client’s sites and rejects provider and other-workspace access',async()=>{
  const pranav=await requestSites(ids.pranav,ids.ridgeline),omar=await requestSites(ids.omar,ids.ridgeline);
  expect(pranav.length).toBe(3);expect(pranav.every(s=>s.client_id===ids.harbor)).toBe(true);
  expect(omar.length).toBe(2);expect(omar.every(s=>s.client_id===ids.northgate)).toBe(true);
  await expect(requestSites(ids.pranav,ids.summit)).rejects.toMatchObject({status:404});
  await expect(requestSites(ids.imran,ids.ridgeline)).rejects.toMatchObject({status:403});
 });
});
