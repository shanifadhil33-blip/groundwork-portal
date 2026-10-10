import React from 'react';
import { expect,it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantMarkdown } from '../components/ui/assistant-markdown';
it('renders formatting and escapes model HTML',()=>{
 const html=renderToStaticMarkup(<AssistantMarkdown text={'**Bold** *italic* _also italic_ `code`\n\n- One\n- Two\n\n1. First\n2. Second\n\n<script>alert(1)</script>'}/>);
 expect(html).toContain('<strong>Bold</strong>');expect(html).toContain('<em>italic</em>');expect(html).toContain('<code>code</code>');expect(html).toContain('<ul>');expect(html).toContain('<ol>');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
});
