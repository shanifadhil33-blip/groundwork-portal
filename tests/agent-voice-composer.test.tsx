// @vitest-environment jsdom
import React, { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Assistant, AssistantComposer } from '../components/app/assistant';
let host:HTMLDivElement,root:Root;
const submit=vi.fn();
const state=vi.hoisted(()=>({voice:true,language:'ne',post:vi.fn()}));
vi.mock('../components/ui/lazy-dialog',async()=>await import('../components/ui/dialog'));
vi.mock('../components/app/context',()=>({useApp:()=>({member:{role:'technician'},me:{user:{id:'Ravi'}}})}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:{agent_name:null,language:state.language,voice_enabled:state.voice}})}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),post:state.post}));

function Harness({voice=true,active=true}:{voice?:boolean;active?:boolean}){const [input,setInput]=useState('Existing draft'),ref=useRef<HTMLTextAreaElement>(null);return <AssistantComposer input={input} setInput={setInput} inputRef={ref} busy={false} blocked={false} active={active} submit={submit} ws="workspace" language="ne" voiceEnabled={voice} rememberMode/>;}
beforeEach(()=>{submit.mockReset();localStorage.clear();sessionStorage.clear();state.voice=true;state.language='ne';state.post.mockReset().mockResolvedValue({available:true,reply:'**Ready**, Ravi 🙂 [Open job](/work-orders/123)'});host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.useRealTimers();Reflect.deleteProperty(window,'SpeechRecognition');});
async function mount(props={}){await act(async()=>root.render(<Harness {...props}/>));}
async function click(label:string){const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent===label||b.getAttribute('aria-label')===label);expect(button).toBeTruthy();await act(async()=>button!.click());}
function speech(){const s={lang:'',continuous:false,interimResults:false,start:vi.fn(),stop:vi.fn(),abort:vi.fn(),onresult:null as any,onend:null as any,onerror:null as any};Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:class{constructor(){return s;}}});return s;}
it('uses the chosen language and appends a transcript without sending',async()=>{const s=speech();await mount();await click('Use microphone');expect(s.lang).toBe('ne-NP');expect(host.textContent).toContain('Listening0:00CancelStop');await act(async()=>s.onresult({results:[[{transcript:'Fixed the pump'}]]}));expect(host.querySelector('textarea')?.value).toBe('Existing draft Fixed the pump');expect(document.activeElement).toBe(host.querySelector('textarea'));expect(submit).not.toHaveBeenCalled();await click('Stop');await act(async()=>s.onend());await click('Send');expect(submit).toHaveBeenCalledOnce();});
it('does not duplicate earlier speech results',async()=>{const s=speech();await mount();await click('Use microphone');await act(async()=>s.onresult({resultIndex:0,results:[[{transcript:'First'}]]}));await act(async()=>s.onresult({resultIndex:1,results:[[{transcript:'First'}],[{transcript:'Second'}]]}));expect(host.querySelector('textarea')?.value).toBe('Existing draft First Second');expect(submit).not.toHaveBeenCalled();});
it('shows the exact permission message and keeps the draft',async()=>{const s=speech();await mount();await click('Use microphone');await act(async()=>s.onerror({error:'not-allowed'}));expect(host.textContent).toContain('Microphone is blocked. Allow it in your browser settings to talk to your agent.');expect(host.querySelector('textarea')?.value).toBe('Existing draft');expect(submit).not.toHaveBeenCalled();});
it('hides the microphone when voice is off and stops on close',async()=>{const s=speech();await mount();await click('Use microphone');await mount({active:false});expect(s.abort).toHaveBeenCalled();await mount({voice:false});expect(host.querySelector('[aria-label="Use microphone"]')).toBeNull();});
it('stops recording before two minutes and shows elapsed time',async()=>{vi.useFakeTimers();const s=speech();await mount();await click('Use microphone');await act(async()=>vi.advanceTimersByTime(65_000));expect(host.textContent).toContain('1:05');await act(async()=>vi.advanceTimersByTime(54_000));expect(s.stop).toHaveBeenCalledOnce();expect(submit).not.toHaveBeenCalled();});
function media(){const track={stop:vi.fn()},getUserMedia=vi.fn().mockResolvedValue({getTracks:()=>[track]});Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});let recording:any;
 class Recorder{static isTypeSupported=()=>true;state='inactive';mimeType='audio/webm;codecs=opus';onstop:any;ondataavailable:any;onerror:any;constructor(){recording=this;}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'],{type:this.mimeType})});void this.onstop?.();}}
 vi.stubGlobal('MediaRecorder',Recorder);return {getUserMedia,track,get recording(){return recording;}};}
it('records and uploads audio when browser speech is missing and never sends the transcript',async()=>{const m=media();const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({transcript:'Fixed the pump'})});vi.stubGlobal('fetch',fetcher);await mount();await click('Use microphone');expect(m.getUserMedia).toHaveBeenCalledWith({audio:true});expect(host.textContent).toContain('Listening');await click('Stop');expect(m.track.stop).toHaveBeenCalled();expect(fetcher).toHaveBeenCalledWith('/api/workspaces/workspace/assistant/transcribe',expect.objectContaining({method:'POST',body:expect.any(FormData)}));expect(host.querySelector('textarea')?.value).toBe('Existing draft Fixed the pump');expect(document.activeElement).toBe(host.querySelector('textarea'));expect(submit).not.toHaveBeenCalled();await click('Send');expect(submit).toHaveBeenCalledOnce();});
it('handles denied permission in the recording fallback',async()=>{const m=media();m.getUserMedia.mockRejectedValue({name:'NotAllowedError'});await mount();await click('Use microphone');expect(host.textContent).toContain('Microphone is blocked. Allow it in your browser settings to talk to your agent.');expect(submit).not.toHaveBeenCalled();});
it('stops tracks granted after the chat closes',async()=>{const m=media();let grant:(v:any)=>void=()=>{};m.getUserMedia.mockReturnValue(new Promise(resolve=>{grant=resolve;}));await mount();await click('Use microphone');await mount({active:false});await act(async()=>grant({getTracks:()=>[m.track]}));expect(m.track.stop).toHaveBeenCalled();expect(m.recording).toBeUndefined();});
it('discards an upload result after closing and aborts the request',async()=>{const m=media();let finish:(v:any)=>void=()=>{};const fetcher=vi.fn().mockReturnValue(new Promise(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetcher);await mount();await click('Use microphone');await click('Stop');expect(m.track.stop).toHaveBeenCalled();await mount({active:false});expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);await act(async()=>finish({ok:true,json:async()=>({transcript:'Late words'})}));expect(host.querySelector('textarea')?.value).toBe('Existing draft');expect(submit).not.toHaveBeenCalled();});

import { editDictatedRanges, INPUT_MODE_KEY, pickSpeechVoice, rememberedInputMode, speechText } from '../lib/ui/voice';
it('cleans markdown and links while preserving words and emoji',()=>{
 expect(speechText('[Ravi](https://example.com/a_(b))[Imran](/job)')).toBe('RaviImran');
 expect(speechText('# Hello **Ravi** 🙂\n\n> _Ready_\n* [Open job](https://example.com/job)\n1. `Check` ~~now~~\n![Pump](pump.png)\n[Report][job]\n[job]: https://example.com/job\n---')).toBe('Hello Ravi 🙂 Ready Open job Check now Pump Report');
});
it('picks the exact locale first, then its base language, or no voice',()=>{
 const voices=[{lang:'en-US'},{lang:'ne-IN'},{lang:'ne-NP'}];
 expect(pickSpeechVoice(voices,'NE-np')).toBe(voices[2]);
 expect(pickSpeechVoice(voices,'ne-BT')).toBe(voices[1]);
 expect(pickSpeechVoice(voices,'ar-AE')).toBeUndefined();
 expect(pickSpeechVoice([],'ne-NP')).toBeUndefined();
});
it('keeps only dictated spans that survive edits',()=>{
 expect(editDictatedRanges('Pump ready','The Pump ready',[{start:0,end:10}])).toEqual([{start:4,end:14}]);
 expect(editDictatedRanges('Pump ready','Pump fixed',[{start:0,end:10}])).toEqual([{start:0,end:5}]);
 expect(editDictatedRanges('Pump ready','Typed',[{start:0,end:10}])).toEqual([]);
});
async function type(value:string){const field=document.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});}
it('remembers talking or typing and restores the voice placeholder without recording',async()=>{
 const s=speech();localStorage.setItem(INPUT_MODE_KEY,'voice');await mount();
 expect(host.querySelector('textarea')?.placeholder).toBe('Tap the microphone and speak');expect(s.start).not.toHaveBeenCalled();
 await type('Hello Ravi');expect(localStorage.getItem(INPUT_MODE_KEY)).toBe('text');
 await mount({active:false});await mount();expect(host.querySelector('textarea')?.placeholder).toBe('Ask Agent or speak');
 await click('Use microphone');await act(async()=>s.onresult({results:[[{transcript:'Pump ready'}]]}));
 expect(localStorage.getItem(INPUT_MODE_KEY)).toBe('voice');await mount({active:false});await mount();
 expect(host.querySelector('textarea')?.placeholder).toBe('Tap the microphone and speak');
 await mount({voice:false});expect(host.querySelector('textarea')?.placeholder).toBe('Ask Agent or speak');
});
it('uses text mode for invalid or unavailable device storage',()=>{
 localStorage.setItem(INPUT_MODE_KEY,'other');expect(rememberedInputMode()).toBe('text');
 const get=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error();});expect(rememberedInputMode()).toBe('text');get.mockRestore();
});
function synthesis(voices=[{lang:'ne-NP'}]){
 const synth={getVoices:vi.fn(()=>voices),speak:vi.fn(),cancel:vi.fn()};
 vi.stubGlobal('speechSynthesis',synth);
 vi.stubGlobal('SpeechSynthesisUtterance',class {text:string;lang='';voice=null;onend:any;onerror:any;constructor(text:string){this.text=text;}});
 return synth;
}
async function chat({active=true}:{active?:boolean}={}){
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));Element.prototype.scrollIntoView=vi.fn();
 await act(async()=>root.render(<Assistant ws="workspace" docked={active} open={false} onClose={()=>{}}/>));
}
async function dictate(words='Pump ready'){
 const s=speech();await click('Use microphone');await act(async()=>s.onresult({results:[[{transcript:words}]]}));await click('Stop');await act(async()=>s.onend());return s;
}
it('reads only after a dictated send and does not read the next typed reply',async()=>{
 const synth=synthesis();await chat();await dictate();expect(synth.speak).not.toHaveBeenCalled();await click('Send');
 expect(synth.speak).toHaveBeenCalledOnce();expect(synth.speak.mock.calls[0][0]).toMatchObject({text:'Ready, Ravi 🙂 Open job',lang:'ne-NP',voice:{lang:'ne-NP'}});
 expect(host.querySelector('[aria-label="Stop reading"]')).toBeTruthy();expect(localStorage.getItem(INPUT_MODE_KEY)).toBe('voice');
 await type('Who is free?');const count=synth.cancel.mock.calls.length;await click('Send');expect(synth.cancel.mock.calls.length).toBeGreaterThan(count);expect(synth.speak).toHaveBeenCalledOnce();expect(localStorage.getItem(INPUT_MODE_KEY)).toBe('text');expect(host.querySelector('[aria-label="Stop reading"]')).toBeNull();
});
it('still reads when some dictated words remain after typing and clears provenance when all are replaced',async()=>{
 const synth=synthesis();await chat();await type('Hello');await dictate('Ravi pump ready');await type('Hello Ravi pump ready today');await click('Send');expect(synth.speak).toHaveBeenCalledOnce();
 await dictate('Pump ready');await type('Who is free?');await click('Send');expect(synth.speak).toHaveBeenCalledOnce();
});
it('tracks later recognition results when earlier dictated words are removed',async()=>{
 const synth=synthesis(),s=speech();await chat();await click('Use microphone');
 await act(async()=>s.onresult({resultIndex:0,results:[[{transcript:'Pump'}]]}));
 await act(async()=>s.onresult({resultIndex:1,results:[[{transcript:'Pump'}],[{transcript:'ready'}]]}));
 await click('Stop');await act(async()=>s.onend());await type('ready');await click('Send');expect(synth.speak).toHaveBeenCalledOnce();
});
it('Stop reading cancels immediately and stale end events do not hide a newer Stop button',async()=>{
 const synth=synthesis();await chat();await dictate();await click('Send');const first=synth.speak.mock.calls[0][0];const count=synth.cancel.mock.calls.length;
 await click('Stop reading');expect(synth.cancel).toHaveBeenCalledTimes(count+1);expect(host.querySelector('[aria-label="Stop reading"]')).toBeNull();
 await dictate();await click('Send');await act(async()=>first.onend());expect(host.querySelector('[aria-label="Stop reading"]')).toBeTruthy();
 await act(async()=>synth.speak.mock.calls[1][0].onend());expect(host.querySelector('[aria-label="Stop reading"]')).toBeNull();
});
it('starting the microphone, closing chat, disabling voice and unmounting cancel speech',async()=>{
 const synth=synthesis();await chat();await dictate();await click('Send');let count=synth.cancel.mock.calls.length;
 const s=speech();await click('Use microphone');expect(synth.cancel).toHaveBeenCalledTimes(count+1);expect(host.querySelector('[aria-label="Stop reading"]')).toBeNull();await click('Stop');await act(async()=>s.onend());
 await dictate();await click('Send');count=synth.cancel.mock.calls.length;await chat({active:false});expect(synth.cancel.mock.calls.length).toBeGreaterThan(count);
 await chat();await dictate();await click('Send');count=synth.cancel.mock.calls.length;state.voice=false;await chat();expect(synth.cancel.mock.calls.length).toBeGreaterThan(count);expect(host.querySelector('[aria-label="Stop reading"]')).toBeNull();
 count=synth.cancel.mock.calls.length;await act(async()=>root.render(<div/>));expect(synth.cancel.mock.calls.length).toBeGreaterThan(count);
});
it('does not speak late replies after closing or turning voice off',async()=>{
 const synth=synthesis();let finish!:(reply:unknown)=>void;state.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await chat();await dictate();await click('Send');await chat({active:false});await chat();await act(async()=>finish({available:true,reply:'Ready'}));expect(synth.speak).not.toHaveBeenCalled();
 await dictate();await click('Send');state.voice=false;await chat();state.voice=true;await chat();await act(async()=>finish({available:true,reply:'Ready'}));expect(synth.speak).not.toHaveBeenCalled();
});
it('keeps text available without errors when no voice matches or speech is unsupported',async()=>{
 const synth=synthesis([{lang:'en-US'}]);await chat();await dictate();await click('Send');expect(synth.speak).not.toHaveBeenCalled();expect(host.textContent).toContain('Ready');expect(host.querySelector('[role="alert"]')).toBeNull();
 vi.stubGlobal('speechSynthesis',undefined);await dictate();await click('Send');expect(host.textContent).toContain('Ready');
});
it('voice off prevents speech and keeps the desktop placeholder even for a dictated draft',async()=>{
 const synth=synthesis();await chat();await dictate();state.voice=false;await chat();await click('Send');
 expect(synth.speak).not.toHaveBeenCalled();expect(host.querySelector('textarea')?.placeholder).toBe('Ask the agent');expect(host.querySelector('[aria-label="Use microphone"]')).toBeNull();
});
it('reads confirmation text without button labels and leaves writes behind confirmation',async()=>{
 const synth=synthesis();state.post.mockResolvedValue({available:true,pending_action:{id:'pending',summary:'Assign the pump to Ravi',why:'He is free'}});
 await chat();await dictate('Assign Ravi');await click('Send');
 expect(synth.speak.mock.calls[0][0].text).toBe('Assign the pump to Ravi He is free');expect(host.textContent).toContain('Yes');expect(host.textContent).toContain('Change');expect(state.post).toHaveBeenCalledOnce();expect(state.post.mock.calls[0][1]).not.toHaveProperty('readAloud');
 await click('Yes');expect(state.post.mock.calls[1][1]).toMatchObject({confirm_action_id:'pending',messages:[]});expect(synth.speak).toHaveBeenCalledOnce();
});
it('never reads offer buttons or quick answer labels',async()=>{
 const synth=synthesis();state.post.mockResolvedValue({available:true,reply:'Ask your supervisor.',choices:['Show jobs'],offers:[{to_name:'Ravi',question:'Who can help?',proposed:'Assign Ravi'}]});
 await chat();await dictate();await click('Send');expect(host.textContent).toContain('Ask Ravi');expect(host.textContent).toContain('Show jobs');expect(synth.speak.mock.calls[0][0].text).toBe('Ask your supervisor.');
});
it('reads a reply to an uploaded transcript and never sends before Send',async()=>{
 const synth=synthesis();media();const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({transcript:'Pump ready'})});vi.stubGlobal('fetch',fetcher);
 await chat();await click('Use microphone');await click('Stop');expect(state.post).not.toHaveBeenCalled();await click('Send');expect(synth.speak).toHaveBeenCalledOnce();
});
it('does not read restored chat on reopen or remount',async()=>{
 const synth=synthesis();await chat();await dictate();await click('Send');await chat({active:false});await chat();expect(synth.speak).toHaveBeenCalledOnce();
 await act(async()=>root.render(<div/>));await chat();expect(synth.speak).toHaveBeenCalledOnce();expect(host.textContent).toContain('Ready');expect(host.querySelector('textarea')?.placeholder).toBe('Tap the microphone and speak');
});
it.each(['button','Escape'])('cancels immediately when closing with %s before the sheet animation ends',async how=>{
 const synth=synthesis(),onClose=vi.fn();await chat();await dictate();await click('Send');
 await act(async()=>root.render(<Assistant ws="workspace" open onClose={onClose}/>));
 expect(document.querySelector('[aria-label="Stop reading"]')).toBeTruthy();const count=synth.cancel.mock.calls.length;
 vi.useFakeTimers();await act(async()=>{
  if(how==='button')document.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click();
  else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 });
 expect(synth.cancel).toHaveBeenCalledTimes(count+1);expect(onClose).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Stop reading"]')).toBeNull();
});
