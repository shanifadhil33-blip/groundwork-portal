/** Read container timing, including live WebM without a declared duration. */
export function audioDuration(bytes:Uint8Array,mime:string):number|null {
 const b=Buffer.from(bytes);
 try{
  if(mime==='audio/wav'){
   if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')return null;
   let rate=0,total=0;for(let i=12;i+8<=b.length;){const n=b.readUInt32LE(i+4),end=i+8+n;if(end>b.length)return null;const tag=b.toString('ascii',i,i+4);if(tag==='fmt '&&n>=16)rate=b.readUInt32LE(i+16);if(tag==='data')total+=n;i=end+(n%2);}
   return rate&&total?total/rate:null;
  }
  if(mime==='audio/ogg'){
   let granule=0;for(let i=0;i+27<=b.length;){if(b.toString('ascii',i,i+4)!=='OggS')return null;const count=b[i+26];if(i+27+count>b.length)return null;const g=b.readBigUInt64LE(i+6);if(g!==0xffffffffffffffffn)granule=Math.max(granule,Number(g));let size=0;for(let j=0;j<count;j++)size+=b[i+27+j];i+=27+count+size;}
   return b.includes(Buffer.from('OpusHead'))&&granule?granule/48000:null;
  }
  if(mime==='audio/mp4'){
   let duration=0;const scales=new Map<number,number>(),defaults=new Map<number,number>();
   function boxes(start:number,end:number){const out:{tag:string;p:number;end:number}[]=[];for(let i=start;i+8<=end;){let size=b.readUInt32BE(i),header=8;if(size===1){size=Number(b.readBigUInt64BE(i+8));header=16;}if(size===0)size=end-i;if(size<header||i+size>end)throw Error();out.push({tag:b.toString('ascii',i+4,i+8),p:i+header,end:i+size});i+=size;}return out;}
   const top=boxes(0,b.length);
   for(const moov of top.filter(x=>x.tag==='moov'))for(const child of boxes(moov.p,moov.end)){
    if(child.tag==='mvex')for(const trex of boxes(child.p,child.end).filter(x=>x.tag==='trex'))defaults.set(b.readUInt32BE(trex.p+4),b.readUInt32BE(trex.p+12));
    if(child.tag!=='trak')continue;
    const track=boxes(child.p,child.end),tkhd=track.find(x=>x.tag==='tkhd');let trackId=0;if(tkhd)trackId=b.readUInt32BE(tkhd.p+(b[tkhd.p]===1?20:12));
    for(const mdia of track.filter(x=>x.tag==='mdia'))for(const mdhd of boxes(mdia.p,mdia.end).filter(x=>x.tag==='mdhd')){const p=mdhd.p,v=b[p],scale=b.readUInt32BE(p+(v===1?20:12)),ticks=v===1?Number(b.readBigUInt64BE(p+24)):b.readUInt32BE(p+16);if(scale){scales.set(trackId,scale);duration=Math.max(duration,ticks/scale);}}
   }
   // Safari can write fragmented MP4 with a zero duration in its initial header.
   const ends=new Map<number,number>();
   for(const moof of top.filter(x=>x.tag==='moof'))for(const traf of boxes(moof.p,moof.end).filter(x=>x.tag==='traf')){
    const parts=boxes(traf.p,traf.end),tfhd=parts.find(x=>x.tag==='tfhd');if(!tfhd)continue;
    const flags=b.readUIntBE(tfhd.p+1,3),id=b.readUInt32BE(tfhd.p+4);let p=tfhd.p+8;
    if(flags&1)p+=8;if(flags&2)p+=4;let sample=defaults.get(id)??0;if(flags&8)sample=b.readUInt32BE(p);
    const tfdt=parts.find(x=>x.tag==='tfdt');let ticks=tfdt?(b[tfdt.p]===1?Number(b.readBigUInt64BE(tfdt.p+4)):b.readUInt32BE(tfdt.p+4)):(ends.get(id)??0);
    for(const trun of parts.filter(x=>x.tag==='trun')){const f=b.readUIntBE(trun.p+1,3),count=b.readUInt32BE(trun.p+4);if(count>1_000_000)throw Error();let q=trun.p+8;if(f&1)q+=4;if(f&4)q+=4;for(let j=0;j<count;j++){if(q>trun.end)throw Error();ticks+=f&0x100?b.readUInt32BE(q):sample;if(f&0x100)q+=4;if(f&0x200)q+=4;if(f&0x400)q+=4;if(f&0x800)q+=4;}if(q>trun.end)throw Error();}
    ends.set(id,ticks);const scale=scales.get(id);if(scale)duration=Math.max(duration,ticks/scale);
   }
   return duration||null;
  }
  if(mime==='audio/webm'){
   if(b.readUInt32BE(0)!==0x1a45dfa3)return null;
   let scale=1_000_000,maximum=0,declared=0;
   function vint(i:number,id=false){let n=1,mask=128;while(n<=8&&!(b[i]&mask)){n++;mask>>=1;}if(n>8||i+n>b.length)throw Error();let value=id?b[i]:b[i]&(mask-1),unknown=!id&&(b[i]&(mask-1))===mask-1;for(let j=1;j<n;j++){value=value*256+b[i+j];unknown=unknown&&b[i+j]===255;}return {value,n,unknown};}
   function elements(start:number,end:number,depth=0,cluster=0){if(depth>8)throw Error();for(let i=start;i<end;){const id=vint(i,true),size=vint(i+id.n),p=i+id.n+size.n,e=size.unknown?end:p+size.value;if(e>end||e<=i)throw Error();let value=0;if([0x2ad7b1,0xe7].includes(id.value)){for(let j=p;j<e;j++)value=value*256+b[j];if(id.value===0x2ad7b1)scale=value;else cluster=value;}
    if(id.value===0x4489)declared=e-p===4?b.readFloatBE(p):e-p===8?b.readDoubleBE(p):0;
    if(id.value===0xa3||id.value===0xa1){const track=vint(p);if(p+track.n+3>e)throw Error();maximum=Math.max(maximum,cluster+b.readInt16BE(p+track.n));}
    if([0x18538067,0x1549a966,0x1f43b675,0xa0].includes(id.value))elements(p,e,depth+1,cluster);i=e;}}
   elements(0,b.length);return Math.max(declared,maximum)*scale/1_000_000_000||null;
  }
 }catch{return null;}
 return null;
}
