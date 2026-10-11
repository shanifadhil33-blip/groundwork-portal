'use client';
export default function GlobalError({ retry }: { retry: () => void }) {
  return <html lang="en"><body style={{margin:0,background:'#FFFFFF',color:'#000000',fontFamily:'Arial, sans-serif'}}><title>Page unavailable · Groundwork</title><main style={{maxWidth:480,margin:'12vh auto',padding:24}}><p>Groundwork</p><h1>We couldn’t open this page.</h1><p>Please try again. If this keeps happening, come back later.</p><div style={{display:'flex',gap:16,flexWrap:'wrap'}}><button style={{background:'#000000',color:'#FFFFFF',padding:'12px 16px',border:'1px solid #000000',borderRadius:6}} onClick={retry}>Try again</button><a style={{color:'#000000',padding:12}} href="/">Back to home</a><a style={{color:'#000000',padding:12}} href="/sign-in">Sign in again</a></div></main></body></html>;
}
