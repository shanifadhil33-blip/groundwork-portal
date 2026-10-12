/** Runtime IANA database, plus common aliases omitted by supportedValuesOf. */
export function timezoneOptions(current = '', personal = false) {
  const zones = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone'), ...(current ? [current] : [])])].sort();
  return [...(personal ? [{value:'',label:'Use workspace timezone'}] : []), ...zones.map(value => ({value,label:value.replaceAll('_',' ')}))];
}
