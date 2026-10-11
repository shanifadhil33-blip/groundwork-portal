import { dateInput } from './work-orders';
import { importFields, type ImportRow, type Mapping } from './imports';
export function nextQueueRow(rows: ImportRow[], removed: string[], current?: ImportRow | null) {
 const remaining=rows.filter(row=>!removed.includes(row.id)),index=current?rows.findIndex(row=>row.id===current.id):-1;
 return rows.slice(index+1).find(row=>!removed.includes(row.id))??remaining[0]??null;
}
export function suggestionEdits(row: ImportRow, timezone?: string): Mapping {
 return {...Object.fromEntries(importFields.map(field=>[field,['due_on','scheduled_for'].includes(field)?dateInput(row.data[field],timezone):row.data[field]??''])),...(row.ai_summary?{description:row.ai_summary}:{}),...(row.ai_priority?{priority:row.ai_priority}:{})};
}
