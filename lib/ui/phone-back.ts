'use client';
import { useEffect,useRef } from 'react';
type Layer={close:()=>void|boolean};
const layers:Layer[]=[];
const marker='groundworkPhoneLayer';
let sentinelUrl='';
let listening=false,leaving=false,cleanup:ReturnType<typeof setTimeout>|undefined;
function back(event:PopStateEvent){
 if(leaving){leaving=false;event.stopImmediatePropagation();return;}
 const layer=layers.at(-1);if(!layer)return;
 event.stopImmediatePropagation();
 if(layer.close()!==false)layers.pop();
 if(layers.length)history.pushState({...history.state,[marker]:true},'',location.href);
}
export function usePhoneLayer(open:boolean,onClose:()=>void|boolean){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  if(!open||typeof matchMedia!=='function'||!matchMedia('(pointer: coarse)').matches)return;
  if(cleanup)clearTimeout(cleanup);
  if(!listening){window.addEventListener('popstate',back,true);listening=true;}
  const layer:Layer={close:()=>close.current()};layers.push(layer);
  if(!history.state?.[marker]){sentinelUrl=location.href;history.pushState({...history.state,[marker]:true},'',location.href);}
  return()=>{const index=layers.indexOf(layer);if(index>=0)layers.splice(index,1);cleanup=setTimeout(()=>{if(layers.length)return;if(history.state?.[marker]&&location.href===sentinelUrl){leaving=true;history.back();}},0);};
 },[open]);
}
