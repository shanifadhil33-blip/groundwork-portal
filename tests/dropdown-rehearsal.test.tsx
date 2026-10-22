// @vitest-environment jsdom
import React,{act} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { Dropdown } from '../components/ui/dropdown';
(globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
afterEach(()=>{act(()=>root.unmount());host.remove();});
async function mount(practice:boolean){
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(<Dropdown label="Country" value="country0" clearable options={Array.from({length:20},(_,i)=>({value:`country${i}`,label:`Country ${i}`,noTranslate:practice}))} onChange={()=>{}} {...(practice?{searchLabel:'Search',clearLabel:'Clear'}:{})}/>));
 await act(async()=>host.querySelector('button')!.click());
}
it('practice menus use static search and clear labels and retain keyboard closing',async()=>{
 await mount(true);
 expect(document.querySelector('input')?.getAttribute('aria-label')).toBe('Search');
 expect(document.querySelector('.menu-clear')?.textContent).toBe('Clear');
 expect(document.querySelectorAll('.menu-option [data-no-translate]')).toHaveLength(20);
 await act(async()=>document.querySelector('[role=menu]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 expect(document.querySelector('[role=menu]')).toBeNull();expect(document.activeElement).toBe(host.querySelector('button'));
});
it('ordinary menus keep their existing labels',async()=>{
 await mount(false);
 expect(document.querySelector('input')?.getAttribute('aria-label')).toBe('Search Country');
 expect(document.querySelector('input')?.getAttribute('placeholder')).toBe('Search country');
 expect(document.querySelector('.menu-clear')?.textContent).toBe('Clear country');
});
