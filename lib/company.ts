import { z } from 'zod';
export const COMPANY_ROLES=['owner','manager','admin','staff','office','technician'] as const;
export const DASHBOARDS=['overview','work','schedule','team','documents','queue','suggestions','clients','import','supplier'] as const;
export const companyOptions={
 company_size:z.enum(['small','big']).optional(),
 enabled_roles:z.array(z.enum(COMPANY_ROLES)).refine(v=>v.includes('owner')&&v.includes('admin'),'Keep Owner and Admin.').optional(),
 enabled_dashboards:z.array(z.enum(DASHBOARDS)).min(1).optional(),
};
export function sizeRoles(extra:string[],added:string[],size:'small'|'big'){
 if(size==='small'){const missing=['staff','technician'].filter(r=>!extra.includes(r));return {extra_roles:[...extra,...missing],size_added_roles:[...new Set([...added,...missing])]};}
 return {extra_roles:extra.filter(r=>!added.includes(r)),size_added_roles:[]};
}
export function menuEnabled(href:string,enabled?:string[]){if(!enabled)return true;const key:Record<string,string>={'/overview':'overview','/dashboard':'work','/schedule':'schedule','/team':'team','/documents':'documents','/queue':'queue','/suggestions':'suggestions','/clients':'clients','/import':'import','/supplier':'supplier'};return !key[href]||enabled.includes(key[href]);}
