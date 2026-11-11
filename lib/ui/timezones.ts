/** Runtime IANA database, plus common aliases omitted by supportedValuesOf. */
export function timezoneOptions(current = '', personal = false) {
  const zones = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone'), ...(current ? [current] : [])])].sort();
  // Zone names are data, never translated.
  return [...(personal ? [{value:'',label:'Use the company time zone'}] : []), ...zones.map(value => ({value,label:value.replaceAll('_',' '),noTranslate:true}))];
}
