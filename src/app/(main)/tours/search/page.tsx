import { redirect } from 'next/navigation';

export default async function SearchResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved ?? {})) {
    if (typeof value === 'string' && value.length > 0) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  redirect(qs ? `/tours?${qs}` : '/tours');
}
