import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AppContext } from '../components/app/context';
import { DemoDecisionText } from '../components/app/demo-decision-text';
import { DEMO_DECISION_COPY } from '../lib/demo-decision-copy';
function render(demo: boolean, text: string) {
  const context = { workspace: { is_demo: demo } } as React.ContextType<typeof AppContext>;
  return renderToStaticMarkup(<AppContext.Provider value={context}><DemoDecisionText text={text}/></AppContext.Provider>);
}
it('only exact seeded phrases in demo enter the page translator', () => {
  for (const text of Object.values(DEMO_DECISION_COPY)) {
    expect(render(true,text)).not.toContain('data-no-translate');
    expect(render(false,text)).toContain('data-no-translate="true"');
  }
  expect(render(true,'A private answer from a supervisor')).toContain('data-no-translate="true"');
  expect(render(false,'A private answer from a supervisor')).toContain('data-no-translate="true"');
});
