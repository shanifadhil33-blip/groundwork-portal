import { beforeEach, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({requireUser:vi.fn(),inWorkspace:vi.fn(),preferences:vi.fn(),transcribe:vi.fn()}));
vi.mock('../lib/auth',()=>({requireUser:mock.requireUser}));
vi.mock('../lib/services/shared',()=>({inWorkspace:mock.inWorkspace}));
vi.mock('../lib/services/settings',()=>({getPreferences:mock.preferences}));
vi.mock('../lib/ai-transcribe',()=>({transcribeAudio:mock.transcribe}));
import { POST } from '../app/api/workspaces/[ws]/assistant/transcribe/route';
import { ApiError } from '../lib/http';
import { audioDuration } from '../lib/audio-duration';
const context={params:Promise.resolve({ws:'workspace'})};
function wave(seconds=1){const rate=8000,b=Buffer.alloc(44+rate*seconds);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
function request(audio:Uint8Array=wave(),duration='1'){const form=new FormData();form.append('audio',new Blob([new Uint8Array(audio)],{type:'audio/wav'}),'recording.wav');form.append('duration',duration);return new Request('http://localhost/api',{method:'POST',body:form});}
beforeEach(()=>{vi.resetAllMocks();mock.requireUser.mockResolvedValue('Imran');mock.inWorkspace.mockResolvedValue(undefined);mock.preferences.mockResolvedValue({language:'ne'});mock.transcribe.mockResolvedValue('The pump is fixed');});
it('rejects unsigned requests before membership and providers',async()=>{mock.requireUser.mockRejectedValue(new ApiError(401,'unauthenticated','Sign in to continue.'));expect((await POST(request(),context)).status).toBe(401);expect(mock.inWorkspace).not.toHaveBeenCalled();expect(mock.transcribe).not.toHaveBeenCalled();});
it('rejects non members before reading audio or calling providers',async()=>{mock.inWorkspace.mockRejectedValue(new ApiError(404,'not_found','No access.'));expect((await POST(request(),context)).status).toBe(404);expect(mock.transcribe).not.toHaveBeenCalled();});
it('rejects files above 25 MB even without a content length header',async()=>{expect((await POST(request(new Uint8Array(25*1024*1024+1)),context)).status).toBe(413);expect(mock.transcribe).not.toHaveBeenCalled();});
it('rejects an oversized content length without reading the body',async()=>{const req=request();req.headers.set('content-length',String(26*1024*1024));expect((await POST(req,context)).status).toBe(413);expect(mock.transcribe).not.toHaveBeenCalled();});
it('checks actual audio duration even if the supplied duration is short',async()=>{expect((await POST(request(wave(121),'1'),context)).status).toBe(422);expect(mock.transcribe).not.toHaveBeenCalled();});
it('checks the two minute request limit and malformed audio',async()=>{for(const req of [request(wave(),'121'),request(new Uint8Array([1,2,3]))])expect((await POST(req,context)).status).toBe(422);expect(mock.transcribe).not.toHaveBeenCalled();});
it('transcribes in the signed in user language and returns only draft words',async()=>{const r=await POST(request(),context);expect(r.status).toBe(200);expect(await r.json()).toEqual({transcript:'The pump is fixed'});expect(mock.inWorkspace).toHaveBeenCalledWith('Imran','workspace',expect.any(Function));expect(mock.transcribe).toHaveBeenCalledWith(expect.any(Uint8Array),'audio/wav','ne');});
it('returns a friendly provider failure',async()=>{mock.transcribe.mockResolvedValue(null);const r=await POST(request(),context);expect(r.status).toBe(503);expect((await r.json()).error.message).toBe('We could not hear your message. Please try again or type it.');});
it('reads WAV duration from the bytes',()=>{expect(audioDuration(wave(120),'audio/wav')).toBe(120);expect(audioDuration(new Uint8Array([1,2,3]),'audio/webm')).toBeNull();});
