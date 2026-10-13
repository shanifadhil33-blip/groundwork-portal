import { expect, it } from 'vitest';
import { audioDuration } from '../lib/audio-duration';
function element(id:string,data:Buffer){if(data.length>=127)throw Error();return Buffer.concat([Buffer.from(id,'hex'),Buffer.from([0x80|data.length]),data]);}
function webm(seconds:number){const time=Buffer.alloc(3);time.writeUIntBE(seconds*1000,0,3);const cluster=element('1f43b675',Buffer.concat([element('e7',time),element('a3',Buffer.from([0x81,0,0,0x80,0]))]));return Buffer.concat([element('1a45dfa3',Buffer.alloc(0)),Buffer.from('18538067ff','hex'),element('1549a966',element('2ad7b1',Buffer.from('0f4240','hex'))),cluster]);}
it('reads live WebM cluster timestamps without a declared duration',()=>{expect(audioDuration(webm(119),'audio/webm')).toBe(119);expect(audioDuration(webm(121),'audio/webm')).toBe(121);});
it('rejects truncated WebM elements',()=>{expect(audioDuration(webm(119).subarray(0,18),'audio/webm')).toBeNull();});
function box(type:string,data:Buffer){const header=Buffer.alloc(8);header.writeUInt32BE(data.length+8);header.write(type,4);return Buffer.concat([header,data]);}
it('reads MP4 track duration',()=>{const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(1000,12);mdhd.writeUInt32BE(119000,16);const audio=box('moov',box('trak',box('mdia',box('mdhd',mdhd))));expect(audioDuration(audio,'audio/mp4')).toBe(119);expect(audioDuration(audio.subarray(0,20),'audio/mp4')).toBeNull();});
it('reads Ogg Opus granule timing and rejects broken pages',()=>{const page=Buffer.alloc(36);page.write('OggS');page.writeBigUInt64LE(119n*48000n,6);page[26]=1;page[27]=8;page.write('OpusHead',28);expect(audioDuration(page,'audio/ogg')).toBe(119);page[0]=0;expect(audioDuration(page,'audio/ogg')).toBeNull();});
it('reads fragmented MP4 timing when the initial duration is zero',()=>{
 const tkhd=Buffer.alloc(20);tkhd.writeUInt32BE(1,12);const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(1000,12);
 const tfhd=Buffer.alloc(12);tfhd[3]=8;tfhd.writeUInt32BE(1,4);tfhd.writeUInt32BE(1000,8);
 const trun=Buffer.alloc(8);trun.writeUInt32BE(119,4);
 const audio=Buffer.concat([box('moov',box('trak',Buffer.concat([box('tkhd',tkhd),box('mdia',box('mdhd',mdhd))]))),box('moof',box('traf',Buffer.concat([box('tfhd',tfhd),box('trun',trun)])))]);
 expect(audioDuration(audio,'audio/mp4')).toBe(119);
});
