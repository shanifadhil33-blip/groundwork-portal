import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { openNotificationTarget } from '../lib/ui/notifications';
import { formatDate, isOverdue, localDate, scheduledInstant } from '../lib/dates';
import { fixtureDates } from '../lib/fixture';
import { guessMapping } from '../lib/import/parse';
import { clientEvent, staffEvent, transitionOptions, type Detail } from '../lib/ui/work-orders';
import { AppContext } from '../components/app/context';
import { RowData, ValidationTable } from '../components/app/import-shared';
import { DatePicker } from '../components/ui/date-picker';
import type { ImportRow } from '../lib/ui/imports';
const event=(kind:string,details:object):Detail['timeline'][number]=>({id:'event',kind,details,actor_id:null,created_at:'2026-11-01T00:00:00Z'});

describe('workspace deadlines and visits',()=>{
 it('uses the workspace calendar day at midnight, rather than scheduled time',()=>{
  const now=Date.parse('2026-11-12T20:30:00Z'); // Nov 13 in Dubai, Nov 12 in New York.
  expect(localDate(now,'Asia/Dubai')).toBe('2026-11-13');
  expect(isOverdue({due_on:'2026-11-12',status:'open'},now,'Asia/Dubai')).toBe(true);
  expect(isOverdue({due_on:'2026-11-12',status:'open'},now,'America/New_York')).toBe(false);
  for(const due_on of ['2026-11-13','2026-11-14',null])expect(isOverdue({due_on,status:'scheduled'},now,'Asia/Dubai')).toBe(false);
  for(const status of ['done','cancelled'])expect(isOverdue({due_on:'2026-11-01',status},now)).toBe(false);
 });
 it('keeps calendar dates intact across browser zones and resolves visits in workspace zones',()=>{
  expect(formatDate('2026-11-13','America/Los_Angeles')).toBe('Nov 13, 2026');
  expect(formatDate('2026-11-12T20:00:00Z','Asia/Dubai')).toBe('Nov 13, 2026');
  expect(scheduledInstant('2026-11-13','Asia/Dubai')).toBe('2026-11-13T05:00:00.000Z');
  expect(scheduledInstant('2026-07-13','America/New_York')).toBe('2026-07-13T13:00:00.000Z');
  expect(scheduledInstant('2026-11-13','America/New_York')).toBe('2026-11-13T14:00:00.000Z');
 });
 it('maps due and scheduled columns independently',()=>{
  expect(guessMapping(['Title','Due date','Scheduled for'])).toEqual({title:'Title',due_on:'Due date',scheduled_for:'Scheduled for'});
  expect(guessMapping(['Job Title','Due Date'])).toEqual({title:'Job Title',due_on:'Due Date'});
 });
 it('explains unavailable transitions without offering an unconfirmed close',()=>{
  const options=transitionOptions('open');
  expect(options.find(o=>o.value==='open')).toMatchObject({disabled:true,label:'Open — Current status'});
  expect(options.find(o=>o.value==='done')).toMatchObject({disabled:true,label:'Done — Move to Scheduled first'});
  expect(options.find(o=>o.value==='scheduled')?.disabled).toBe(false);
 });
 it('names assignment, visit, due and status changes for staff and clients',()=>{
  expect(staffEvent(event('assignment_changed',{assignee_name:'Sam'}))).toBe('assigned Sam');
  expect(staffEvent(event('status_changed',{to_status:'in_progress'}))).toBe('moved to In Progress');
  expect(clientEvent(event('schedule_changed',{scheduled_for:'2026-11-07T20:00:00Z'}))).toBe('Visit scheduled for Nov 8, 2026');
  expect(clientEvent(event('due_changed',{due_on:'2026-11-13'}))).toBe('Due date set to Nov 13, 2026');
 });
 it('seeds repeatable, varied dates with creation before activity and updates',()=>{
  const dates=Array.from({length:60},(_,i)=>fixtureDates(i+1,'2026-10-11','Asia/Dubai'));
  expect(fixtureDates(14,'2026-10-11','Asia/Dubai')).toEqual(dates[13]);
  expect(new Set(dates.map(d=>d.created.toISOString().slice(11,16))).size).toBeGreaterThan(10);
  expect(new Set(dates.map(d=>d.due)).size).toBeGreaterThan(30);
  expect(dates.every(d=>d.created.getTime()+6*3600000<d.updated.getTime())).toBe(true);
  expect(dates[0].visit).toBeNull();
 });
});

it('formats import preview and review, places reference errors under reference, and formats picker labels',()=>{
 const row={id:'row',row_number:1,status:'error',data:{title:'Repair tap',client:'Harbor & Pine',site:'Marina',description:'',priority:'normal',due_on:'2026-11-20',scheduled_for:'2026-11-19T20:00:00Z',external_ref:'QA-1001'},errors:[{field:'external_ref',code:'duplicate_ref',message:'raw internal message'}],warnings:[]} as unknown as ImportRow;
 const wrap=(node:React.ReactNode)=>renderToStaticMarkup(<AppContext.Provider value={{workspace:{id:'workspace',name:'Groundwork',is_demo:true,timezone:'Asia/Dubai'},member:null,me:{user:{id:'user',name:'Dana',email:'',image:null},memberships:[]},reload:()=>{},updateName:()=>{}}}>{node}</AppContext.Provider>);
 for(const html of [wrap(<RowData row={row}/>),wrap(<ValidationTable rows={[row]}/>)] ) {
  expect(html).toContain('Nov 20, 2026');expect(html).toContain('Normal');expect(html).not.toContain('T20:00');expect(html).not.toContain('raw internal message');
 }
 const review=wrap(<RowData row={row}/>);
 expect(review).toMatch(/External reference<\/dt><dd[^>]*>QA-1001<ul/);
 expect(wrap(<DatePicker label="Scheduled date" value="2026-09-15" onChange={()=>{}}/>)).toContain('Sep 15, 2026');
});

it('opening a notification records read before navigating, skips existing receipts, and preserves unread on failure',async()=>{
 const item={id:'notice',read_at:null,link_target:{entity:'work_order',id:'order'}},calls:string[]=[];
 await openNotificationTarget(item,async()=>{calls.push('read');},()=>{calls.push('navigate');});expect(calls).toEqual(['read','navigate']);
 const read=vi.fn(),navigate=vi.fn();await openNotificationTarget({...item,read_at:'2026-11-13T00:00:00Z'},read,navigate);expect(read).not.toHaveBeenCalled();expect(navigate).toHaveBeenCalledWith('order');
 navigate.mockClear();await expect(openNotificationTarget(item,async()=>{throw Error('Offline');},navigate)).rejects.toThrow('Offline');expect(navigate).not.toHaveBeenCalled();
 expect(await openNotificationTarget({...item,link_target:null},read,navigate)).toBe(false);
});
