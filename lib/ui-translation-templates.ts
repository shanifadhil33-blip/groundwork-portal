import { isDemoFixtureCopy } from './demo-proof-copy';

/** Only known interface shapes are expanded. Placeholder values remain data, never dictionary keys. */
const shapes: readonly [RegExp, string, readonly string[]][] = [
  [/^(Northgate) is your company, so Postgres row level security allows these rows\.$/, '{company} is your company, so Postgres row level security allows these rows.', ['company']],
  [/^(Northgate) query$/, '{company} query', ['company']],
  [/^(Northgate) query · your company$/, '{company} query · your company', ['company']],
  [/^(.+), (.+)\. Sets address fields, phone format and currency\.$/, '{country}, {region}. Sets address fields, phone format and currency.', ['country', 'region']],
  [/^(\d+) open requests?$/, '{count} open requests', ['count']],
  [/^(\d+) requests?$/, '{count} requests', ['count']],
  [/^(\d+) today$/, '{count} today', ['count']],
  [/^Showing (\d+) of (\d+)$/, 'Showing {count} of {total}', ['count', 'total']],
  [/^New requests, (\d+) waiting$/, 'New requests, {count} waiting', ['count']],
  [/^Select row (\d+): (.+)$/, 'Select row {count}: {job}', ['count', 'job']],
  [/^Call (.+)$/, 'Call {name}', ['name']],
  [/^Move (.+)$/, 'Move {job}', ['job']],
  [/^Remove leave for (.+)$/, 'Remove leave for {name}', ['name']],
  [/^(\d+) (Today|Late|Open) for (.+)$/, '{count} {label} for {name}', ['count', 'label', 'name']],
  [/^· Undone by (.+)$/, '· Undone by {name}', ['name']],
  [/^Your session belongs to (.+)\.$/, 'Your session belongs to {company}.', ['company']],
  [/^Notifications, (\d+) unread$/, 'Notifications, {count} unread', ['count']],
  [/^(\d+) to approve$/, '{count} to approve', ['count']],
  [/^(\d+) unread$/, '{count} unread', ['count']],
  [/^More for (.+)$/, 'More for {item}', ['item']],
  [/^Real name: (.+)$/, 'Real name: {name}', ['name']],
  [/^Client type for (.+)$/, 'Client type for {name}', ['name']],
  [/^(\d+) jobs?$/, '{count} jobs', ['count']],
  [/^(\d+) clients?$/, '{count} clients', ['count']],
  [/^(\d+) entr(?:y|ies)$/, '{count} entries', ['count']],
  [/^(\d+) request to checks?$/, '{count} requests to check', ['count']],
  [/^(\d+) turned downs?$/, '{count} declined requests', ['count']],
  [/^(\d+) rows?$/, '{count} rows', ['count']],
  [/^Expires in (\d+) days$/, 'Expires in {count} days', ['count']],
  [/^(\d+) of (\d+) visits used$/, '{used} of {total} visits used', ['used', 'total']],
  [/^Practice data\. It resets every (\d+) hours\.$/, 'Practice data. It resets every {hours} hours.', ['hours']],
  [/^Excel or CSV file, up to (\d+) lines$/, 'Spreadsheet file, up to {count} lines', ['count']],
  [/^Up to (\d+) MB · (\d+) data rows · unique column headings$/, 'Up to {size} megabytes · {count} data rows · unique column headings', ['size','count']],
  [/^Try the flow with a sample file of (\d+) jobs\.$/, 'Try the flow with a sample file of {count} jobs.', ['count']],
  [/^Nothing yet\. Try telling your Agent: I start at (\d+) now\.$/, 'Nothing yet. Try telling your Agent: I start at {hour} now.', ['hour']],
  [/^For example, weekday mornings (\d+) to (\d+)$/, 'For example, weekday mornings {start} to {end}', ['start','end']],
];
export const UI_TRANSLATION_TEMPLATES = shapes.map(([,key]) => key);
export function interfaceTranslation(source: string, words: Record<string,string>, demo = false): string | undefined {
  if (Object.hasOwn(words,source)) return words[source];
  for (const [pattern,key,names] of shapes) {
    const match=pattern.exec(source),template=words[key];
    if (match && template) {
      const values=Object.fromEntries(names.map((name,index)=>[name, (name === 'label' || (demo && name === 'job' && isDemoFixtureCopy(match[index+1]))) ? (words[match[index+1]] ?? match[index+1]) : match[index+1]]));
      return template.replace(/\{([a-z]+)\}/g,(token,name:string)=>values[name]??token);
    }
  }
}
