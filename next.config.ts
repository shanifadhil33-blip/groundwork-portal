import type { NextConfig } from 'next';
const config: NextConfig = { redirects: async () => [{source:'/approval-queue',destination:'/queue',permanent:true}] };
export default config;
