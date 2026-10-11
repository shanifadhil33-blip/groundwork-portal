import React, { Fragment, type ReactNode } from 'react';
function inline(text:string):ReactNode[] {
 const parts=text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g);
 return parts.map((part,i)=>part.startsWith('`')?<code key={i}>{part.slice(1,-1)}</code>:part.startsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:(part.startsWith('*')||part.startsWith('_'))&&part.length>2?<em key={i}>{part.slice(1,-1)}</em>:<Fragment key={i}>{part}</Fragment>);
}
// Deliberately supports only text formatting. HTML and links remain escaped text.
export function AssistantMarkdown({text}:{text:string}) {
 const blocks:ReactNode[]=[],lines=text.split('\n');
 for(let i=0;i<lines.length;) {
  if(!lines[i].trim()){i++;continue;}
  const match=lines[i].match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
  if(match){const ordered=!match[1],items:ReactNode[]=[];const start=i;
   while(i<lines.length){const m=lines[i].match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);if(!m||!m[1]!==ordered)break;items.push(<li key={i}>{inline(m[2])}</li>);i++;}
   blocks.push(ordered?<ol key={start}>{items}</ol>:<ul key={start}>{items}</ul>);
  }else{const start=i,paragraph:string[]=[];while(i<lines.length&&lines[i].trim()&&!/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i]))paragraph.push(lines[i++]);blocks.push(<p key={start}>{inline(paragraph.join('\n'))}</p>);}
 }
 return <div className="assistant-markdown prose-message">{blocks}</div>;
}
