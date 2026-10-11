import type { NextConfig } from 'next';
const config: NextConfig = {
  redirects: async () => [{source:'/approval-queue',destination:'/queue',permanent:true}],
  // Hashed /_next/static assets already have Next's immutable one-year policy.
  // Public assets retain a bounded lifetime so replacing an unversioned file is safe.
  headers: async () => [{
    source:'/:path*.:ext(webp|png|jpg|jpeg|gif|svg|ico|woff|woff2|mp4|webm)',
    headers:[{key:'Cache-Control',value:'public, max-age=86400, stale-while-revalidate=604800'}],
  }],
};
export default config;
