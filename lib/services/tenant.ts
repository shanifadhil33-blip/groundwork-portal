import { z } from 'zod';
import { ApiError } from '../http';
import type { Context } from './shared';
export const tenantKeys = ['tenant_unit','tenant_name','tenant_phone'] as const;
export const tenantFields = {
 tenant_unit:z.string().trim().max(40).nullable().optional(),
 tenant_name:z.string().trim().max(80).nullable().optional(),
 tenant_phone:z.string().trim().max(30).regex(/^(?:\+?[0-9][0-9 ]*)?$/).nullable().optional(),
};
export function normalizeTenant<T extends Record<string,unknown>>(data:T):T{
 for(const key of tenantKeys)if(Object.hasOwn(data,key))(data as Record<string,unknown>)[key]=typeof data[key]==='string'?(data[key] as string).trim()||null:data[key];
 return data;
}
export function tenantValues(data:Record<string,unknown>){
 return Object.fromEntries(tenantKeys.filter(key=>Object.hasOwn(data,key)).map(key=>[key,data[key]])) as Partial<Record<typeof tenantKeys[number],string|null>>;
}
export function checkTenantInput(c:Context,body:unknown){
 if(!body||typeof body!=='object'||!tenantKeys.some(key=>Object.hasOwn(body,key)))return;
 if(c.role==='client'&&(c.client_kind??'manager')!=='manager')throw new ApiError(400,'validation','Only a building manager can add a tenant.');
 if(!['client','staff','admin'].includes(c.role))throw new ApiError(403,'forbidden','Ask a supervisor to change tenant details.');
 // Validate before the surrounding schema so tenant errors consistently return 400.
 for(const key of tenantKeys)if(!tenantFields[key].safeParse((body as Record<string,unknown>)[key]).success)throw new ApiError(400,'validation',key==='tenant_phone'?'Enter a valid tenant phone number.':'Tenant details are too long.');
}
export function visibleTenant<T extends Record<string,any>>(c:Context,value:T):T{
 if(!(['admin','staff'].includes(c.role)||(c.role==='client'&&(c.client_kind??'manager')==='manager'&&value.client_id===c.client_id)||(c.role==='technician'&&value.assignee_id===c.user))){delete value.tenant_name;delete value.tenant_phone;}
 return value;
}

/** Strip contacts even from nested service results returned to client households and office members. */
export function redactTenantContacts<T>(c:Pick<Context,'role'|'client_kind'>,value:T):T{
 if(c.role!=='client'||(c.client_kind??'manager')==='manager')return value;
 function strip(item:unknown){
  // Photo bytes and dates hold no tenant fields; walking a Buffer would visit every byte.
  if(!item||typeof item!=='object'||ArrayBuffer.isView(item)||item instanceof Date)return;
  const record=item as Record<string,unknown>;
  delete record.tenant_name;delete record.tenant_phone;
  for(const nested of Object.values(record))strip(nested);
 }
 strip(value);return value;
}
