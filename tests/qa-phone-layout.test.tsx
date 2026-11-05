import React from 'react';
import { vi } from 'vitest';
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PageHeader, ResponsiveTable } from '../components/ui/layout';
import { WorkOrderCard } from '../components/app/work-order-card';
import { workOrderTitle, type WorkOrder } from '../lib/ui/work-orders';
const order:WorkOrder={id:'order',order_number:54,title:'Replace washroom tap — Northgate East / 54',site_name:'Northgate East',client_name:'Northgate',assignee_name:'Sam',client_id:'client',site_id:'site',status:'waiting_on_parts',priority:'high',assignee_id:'sam',due_on:'2026-10-10',scheduled_for:null,created_at:'2026-10-09T08:00:00Z',updated_at:'2026-10-09T08:00:00Z',description:''};
it('uses one shared header with separate number, title, status and actions',()=>{
 const html=renderToStaticMarkup(<PageHeader><div><span className="order-number">WO-60</span><div className="detail-title"><h1>Service rooftop ventilation</h1><span>Cancelled</span></div></div><div className="detail-actions"><p>This work order is cancelled.</p><button>Edit work order</button></div></PageHeader>);
 expect(html).toContain('<header class="heading-row page-header">');expect(html).toContain('Job #60</span>');expect(html).toContain('<h1>Service rooftop ventilation</h1>');expect(html).toContain('This work order is cancelled.');
});
it('retains table semantics and labels every cell in mapped rows, including Actions',()=>{
 const html=renderToStaticMarkup(<ResponsiveTable><table><thead><tr><th>Member</th><th><span>Role</span></th><th/></tr></thead><tbody>{['Imran','Sam'].map((name,i)=><tr key={name}><td>{name}</td><td>{i?'Staff':'Admin'}</td><td><button>Remove member</button></td></tr>)}</tbody></table></ResponsiveTable>);
 expect(html).toContain('role="table"');expect(html).toContain('role="rowgroup"');
 expect(html.match(/data-label="Member"/g)).toHaveLength(2);expect(html.match(/data-label="Role"/g)).toHaveLength(2);expect(html.match(/data-label="Actions"/g)).toHaveLength(2);expect(html).toContain('Admin');expect(html).toContain('Staff');
});
it('renders complete client phone cards with clean titles, parts status, priority, site, deadline and assignee',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
 try {
 const html=renderToStaticMarkup(<WorkOrderCard order={order} client timezone="Asia/Dubai" clientName="Northgate" assigneeName="Sam" onOpen={()=>{}}/>);
 expect(html).toContain('<bdi data-no-translate="true">#54</bdi>');expect(html).toContain('<strong data-no-translate="true">Replace washroom tap</strong>');expect(html).not.toContain('Northgate East / 54');expect(html).toContain('Waiting on Parts');expect(html).toContain('High');expect(html).toContain('Northgate · Northgate East');expect(html).toContain('Due ·');expect(html).toContain('Late');expect(html).toContain('<span class="assignee-cell" data-no-translate="true"><span data-no-translate="true">Sam</span></span>');expect(html).toContain('work-row-head');
 const closed=renderToStaticMarkup(<WorkOrderCard order={{...order,status:'done',assignee_id:null,due_on:null}} client={false} clientName="Northgate" assigneeName="Unassigned" onOpen={()=>{}}/>);expect(closed).not.toContain('Late');expect(closed).toContain('No due date');expect(closed).toContain('Unassigned');
 } finally {vi.useRealTimers();}
});
it('removes only a matching legacy site and number suffix',()=>{
 expect(workOrderTitle(order)).toBe('Replace washroom tap');expect(workOrderTitle({...order,title:'Inspect pump / 54'})).toBe('Inspect pump / 54');expect(workOrderTitle({...order,title:'Repair — Northgate East / 55'})).toBe('Repair — Northgate East / 55');expect(workOrderTitle({...order,site_name:'Marina'})).toBe(order.title);
});
it('overrides the old phone widths for shared headers, badges, sheets and table cards',()=>{
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8').split('/* Shared app layouts:')[1];
 expect(css).toContain('flex-direction:column;align-items:stretch');expect(css).toContain('overflow-wrap:anywhere');expect(css).toContain('white-space:normal');expect(css).toContain('display:block;width:100%;min-width:0');expect(css).toContain('content:attr(data-label)');expect(css).toContain('inset:0');expect(css).toContain('.tabs-scroll:after');
});
it('prefetches notifications independently of opening and keeps loaded data during refresh',()=>{
 const source=readFileSync(new URL('../components/app/notifications.tsx',import.meta.url),'utf8');
 const load=source.slice(source.indexOf('const load ='),source.indexOf('// Prefetch'));
 expect(load).not.toContain('setData(null)');expect(load).toContain('run===generation.current');expect(source).toContain('setData(null); lastLoaded.current=0; void load();');expect(source).toContain('open&&!pending.current&&Date.now()-lastLoaded.current>30_000');
 const tabs=readFileSync(new URL('../components/ui/tabs.tsx',import.meta.url),'utf8');expect(tabs).toContain('scrollIntoView');expect(tabs).toContain("inline:'nearest'");
});
