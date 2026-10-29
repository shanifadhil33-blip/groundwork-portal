import { limitAiRequest } from '../../../../../../lib/ai-limits';
import { endpoint } from '../../../../../../lib/api';
import { inWorkspace } from '../../../../../../lib/services/shared';
import { getPreferences } from '../../../../../../lib/services/settings';
import { ApiError, invalid } from '../../../../../../lib/http';
import { transcribeAudio } from '../../../../../../lib/ai-transcribe';
import { audioDuration } from '../../../../../../lib/audio-duration';
export const maxDuration=30;
const MAX_BYTES=25*1024*1024;
export const POST=endpoint(async({user,params,req})=>{
 await inWorkspace(user,params.ws,async()=>undefined);
 const prefs=await getPreferences(user);
 limitAiRequest(user,'transcribe',prefs.language);
 const tooLarge=()=>new ApiError(413,'audio_too_large','This recording is too large. Please record a shorter message.');
 const length=Number(req.headers.get('content-length')??0);if(length>MAX_BYTES+65536)throw tooLarge();
 // Bound streamed bodies too, before allocating multipart data.
 if(!req.body)throw invalid('Please record a message first.');
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_BYTES+65536){await reader.cancel();throw tooLarge();}chunks.push(part.value);}}finally{reader.releaseLock();}
 let form:FormData;try{form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':req.headers.get('content-type')??''}}).formData();}catch{throw invalid('Please record a message first.');}
 const audio=form.get('audio'),seconds=Number(form.get('duration'));
 if(!audio||typeof audio==='string'||!audio.size)throw invalid('Please record a message first.');
 if(audio.size>MAX_BYTES)throw tooLarge();
 if(!Number.isFinite(seconds)||seconds<=0||seconds>120)throw invalid('Please keep recordings within two minutes.');
 const mime=audio.type.split(';')[0];if(!['audio/webm','audio/ogg','audio/mp4','audio/wav'].includes(mime))throw invalid('We could not read this recording. Please type your message.');
 const bytes=new Uint8Array(await audio.arrayBuffer()),duration=audioDuration(bytes,mime);
 if(duration===null||duration<=0)throw invalid('We could not read this recording. Please try again.');
 if(duration>120)throw invalid('Please keep recordings within two minutes.');
 const transcript=await transcribeAudio(bytes,mime,prefs.language??'en-IN');
 if(!transcript)throw new ApiError(503,'voice_unavailable','We could not hear your message. Please try again or type it.');
 return {transcript};
});
