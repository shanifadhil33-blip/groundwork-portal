import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Groundwork', short_name: 'Groundwork', start_url: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#2f6b62', icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }] };
}
