import React from 'react';
import { expect,it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantMarkdown } from '../components/ui/assistant-markdown';
it('renders formatting and escapes model HTML',()=>{
 const html=renderToStaticMarkup(<AssistantMarkdown text={'**Bold** *italic* _also italic_ `code`\n\n- One\n- Two\n\n1. First\n2. Second\n\n<script>alert(1)</script>'}/>);
 expect(html).toContain('<strong>Bold</strong>');expect(html).toContain('<em>italic</em>');expect(html).toContain('<code>code</code>');expect(html).toContain('<ul>');expect(html).toContain('<ol>');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
});
it('makes only local work-order links clickable without showing their storage identifier',()=>{
 const id='50000000-0000-4000-8000-000000000058';
 const html=renderToStaticMarkup(<AssistantMarkdown text={`Moved [WO-58 Test access control reader](/work-orders/${id}) to In Progress.\n\n[unsafe](javascript:alert(1)) [external](https://example.test)`}/>);
 expect(html).toContain(`<a href="/work-orders/${id}">WO-58 Test access control reader</a>`);
 expect(html).not.toContain('href="javascript:');expect(html).not.toContain('href="https://');
 expect(html.replace(/href="[^"]*"/g,'')).not.toContain(id);
});
