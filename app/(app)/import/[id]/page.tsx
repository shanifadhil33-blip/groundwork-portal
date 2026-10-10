import { ImportDetail } from '../../../../components/app/import-detail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ImportDetail id={id} />; }
