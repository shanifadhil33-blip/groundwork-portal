/** Runtime IANA database, plus common aliases omitted by supportedValuesOf. */
export function timezoneOptions(current = '', personal = false) {
  const zones = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone'), ...(current ? [current] : [])])].sort();
  return [...(personal ? [{value:'',label:'Use workspace timezone'}] : []), ...zones.map(value => ({value,label:value.replaceAll('_',' ')}))];
}
export function workspaceName(name: string | null | undefined) {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${first}'s workspace` : 'Your workspace';
}
