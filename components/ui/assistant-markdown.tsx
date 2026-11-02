import React, { Fragment, type ReactNode } from 'react';
import { DirectedLines } from './directed-lines';
import { lineDirection } from '../../lib/ui/text-direction';
function inline(text:string,renderText:(text:string)=>ReactNode=t=>t):ReactNode[] {
 const parts=text.split(/(\[[^\]\n]+\]\(\/work-orders\/[0-9a-f-]{36}\)|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g);
 return parts.map((part,i)=>{const link=part.match(/^\[([^\]]+)\]\((\/work-orders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)$/i);return link?<a key={i} href={link[2]}>{renderText(link[1])}</a>:part.startsWith('`')?<code key={i}>{part.slice(1,-1)}</code>:part.startsWith('**')?<strong key={i}>{renderText(part.slice(2,-2))}</strong>:(part.startsWith('*')||part.startsWith('_'))&&part.length>2?<em key={i}>{renderText(part.slice(1,-1))}</em>:<Fragment key={i}>{renderText(part)}</Fragment>;});
}
// Only local work-order links are clickable. HTML and all other links remain escaped text.
export function AssistantMarkdown({text,renderText}:{text:string;renderText?:(text:string)=>ReactNode}) {
 const blocks:ReactNode[]=[],lines=text.split('\n');
 for(let i=0;i<lines.length;) {
  if(!lines[i].trim()){i++;continue;}
  const match=lines[i].match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
  if(match){const ordered=!match[1],items:ReactNode[]=[];const start=i;
   while(i<lines.length){const m=lines[i].match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);if(!m||!m[1]!==ordered)break;items.push(<li key={i} dir={lineDirection(m[2])}>{inline(m[2],renderText)}</li>);i++;}
   blocks.push(ordered?<ol key={start}>{items}</ol>:<ul key={start}>{items}</ul>);
  }else{const start=i,paragraph:string[]=[];while(i<lines.length&&lines[i].trim()&&!/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i]))paragraph.push(lines[i++]);blocks.push(<p key={start}><DirectedLines text={paragraph.join('\n')} render={line=>inline(line,renderText)}/></p>);}
 }
 return <div className="assistant-markdown prose-message">{blocks}</div>;
}
