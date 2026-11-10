import type { NextConfig } from 'next';
const config: NextConfig = {
  // Cut routes (handoff Part C). Old links keep working and land where the thing lives now.
  redirects: async () => [
    {source:'/approval-queue',destination:'/work-orders?tab=approve',permanent:false},
    {source:'/queue',destination:'/work-orders?tab=approve',permanent:false},
    {source:'/suggestions',destination:'/work-orders?tab=approve',permanent:false},
    {source:'/overview',destination:'/dashboard',permanent:false},
    {source:'/team-space',destination:'/messages',permanent:false},
    {source:'/demo-chat',destination:'/dashboard?agent=whatsapp',permanent:false},
    {source:'/supplier',destination:'/work-orders',permanent:false},
  ],
  // Hashed /_next/static assets already have Next's immutable one-year policy.
  // Public assets retain a bounded lifetime so replacing an unversioned file is safe.
  headers: async () => [{
    source:'/:path*.:ext(webp|png|jpg|jpeg|gif|svg|ico|woff|woff2|mp4|webm)',
    headers:[{key:'Cache-Control',value:'public, max-age=86400, stale-while-revalidate=604800'}],
  }],
};
export default config;
