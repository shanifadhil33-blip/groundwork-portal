/** Exact seeded practice content only. Authored records and editable values stay verbatim. */
export const DEMO_ROUND_TWO_COPY = [
  'Lobby lights flickering', 'Tomorrow morning',
  'Two lights in the lobby keep flickering since this morning.',
  'Replace the second pump seal',
  'The pump next to this one is also leaking a little. Better to change the seal before it gets worse.',
  'Good morning team. Northgate asked for an early visit today, please check your jobs.',
  'On my way. I have the spare filters in the van.',
  'SAMPLE Hot work permit, Marina Exchange',
  'SAMPLE Civil Defence certificate', 'SAMPLE Trade licence', 'SAMPLE Public liability insurance',
  'Monthly maintenance retainer. Put the PO number on every invoice.',
  'Visitor parking at P2. Sign in at the ground floor security desk with your Emirates ID.',
  'Use the loading bay on the lake side. Keys are at reception until 6 pm.',
  'Service lift only for tools and ladders. Book it a day ahead with building management.',
  'The gate code changes monthly. Call the site contact on arrival.',
  'Hard hats and safety shoes past the yellow line.',
  'Street parking only. Ring the studio bell; the door faces the corniche.',
  'Warehouse work only between 7 am and 3 pm.',
  'Main panel', 'Ground floor', 'Roof AC 1', 'Roof AC 2', 'Roof', 'Water pump',
  'Plant room', 'Office water heater', 'Office kitchen', 'big chiller', 'the tower', 'the annex',
  'Inspect reception lighting',
] as const;

/** Data stays outside shipped dictionary keys. Expand only these exact practice instances. */
export const DEMO_ROUND_TWO_TEMPLATES: Record<string, {key: string; values: Record<string,string>}> = {
  'Good morning team. Northgate asked for an early visit today, please check your jobs.': {key: 'Good morning team. {company} asked for an early visit today, please check your jobs.', values: {company: 'Northgate'}},
  'SAMPLE Hot work permit, Marina Exchange': {key: 'SAMPLE Hot work permit, {site}', values: {site: 'Marina Exchange'}},
  'Visitor parking at P2. Sign in at the ground floor security desk with your Emirates ID.': {key: 'Visitor parking at {parking}. Sign in at the ground floor security desk with your Emirates ID.', values: {parking: 'P2'}},
  'Use the loading bay on the lake side. Keys are at reception until 6 pm.': {key: 'Use the loading bay on the lake side. Keys are at reception until {hour} pm.', values: {hour: '6'}},
  'Roof AC 1': {key: 'Roof AC {number}', values: {number: '1'}},
  'Roof AC 2': {key: 'Roof AC {number}', values: {number: '2'}},
  'Warehouse work only between 7 am and 3 pm.': {key: 'Warehouse work only between {start} am and {end} pm.', values: {start: '7', end: '3'}},
};
export function demoRoundTwoTranslations(words: Record<string,string>): Record<string,string> {
  return Object.fromEntries(Object.entries(DEMO_ROUND_TWO_TEMPLATES).flatMap(([source, {key,values}]) => words[key] ? [[source, words[key].replace(/\{([a-z]+)\}/g, (token, name: string) => values[name] ?? token)]] : []));
}
