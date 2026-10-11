import * as XLSX from 'xlsx';
import { invalid } from '../http';
export const fields=['title','description','client','site','priority','due_on','scheduled_for','external_ref'] as const;
export type Field=typeof fields[number];
export type Mapping=Partial<Record<Field,string>>;
const aliases:Record<Field,string[]>={title:['title','task','work order','job','request','issue'],description:['description','details','notes'],client:['client','customer','company'],site:['site','location','address','building'],priority:['priority','urgency'],due_on:['due date','due','deadline','date'],scheduled_for:['scheduled for','scheduled date','visit date'],external_ref:['external ref','reference','ref','external id']};
const normal=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export function guessMapping(headers:string[]):Mapping {
 const mapping:Mapping={};
 for(const f of fields) {
  const exact=headers.find(h=>aliases[f].some(a=>normal(h)===normal(a)));
  const fuzzy=headers.find(h=>aliases[f].some(a=>normal(h).includes(normal(a))));
  if(exact??fuzzy)mapping[f]=exact??fuzzy;
 }
 return mapping;
}
export function parseFile(content:Buffer,filename:string) {
 if(!content.length)throw invalid('This file is empty. Choose a file with column headings and data rows.','file');
 if(content.length>2*1024*1024)throw invalid(`${filename}: the file limit is 2 MB.`,'file');
 if(!/\.(csv|xlsx)$/i.test(filename))throw invalid(`${filename}: use a CSV or XLSX file (maximum 2 MB).`,'file');
 try {
  const book=XLSX.read(content,{type:'buffer',cellDates:false,sheetRows:502,codepage:65001});
  const sheet=book.Sheets[book.SheetNames[0]];
  if(!sheet)throw new Error();
  const grid=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:'',raw:false,blankrows:false});
  const headers=(grid.shift()??[]).map(v=>String(v).trim());
  if(!headers.length||new Set(headers).size!==headers.length||headers.some(h=>!h))throw invalid(`${filename}: use unique, non-empty column headers.`,'file');
  if(!grid.length)throw invalid('This file has no data rows. Add rows beneath the column headings.','file');
  if(grid.length>500)throw invalid(`${filename}: the limit is 500 data rows.`,'file');
  const rows=grid.map(values=>Object.fromEntries(headers.map((h,i)=>[h,String(values[i]??'').trim()])));
  return {headers,rows,mapping:guessMapping(headers)};
 }catch(e){if(e instanceof Error && 'status' in e)throw e;throw invalid(`${filename}: this file could not be read as CSV or XLSX (maximum 2 MB, 500 data rows).`,'file');}
}
