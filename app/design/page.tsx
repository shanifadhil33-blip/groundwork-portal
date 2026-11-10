import { notFound } from 'next/navigation';
import { DesignGallery } from '../../components/ui/design-gallery';

/** Development only reference of every shared component. It does not exist in production. */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignGallery />;
}
