import { createPublicClient } from '@/lib/supabase/server';
import { Agency } from '@/types';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import type { PostgrestError } from '@supabase/supabase-js';

type AgencyRow = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  settings: Record<string, unknown> | null;
  status: 'active' | 'suspended';
  created_at: string;
};

const normalizeHost = (host: string) =>
  host.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');

const getRequestHost = async (): Promise<string | null> => {
  const headerStore = await headers();
  const forwardedHost = headerStore.get('x-forwarded-host');
  const host = forwardedHost ?? headerStore.get('host');
  if (!host) return null;
  return normalizeHost(host);
};

export const getCurrentAgency = cache(async (): Promise<Agency | null> => {
  const supabase = createPublicClient();
  const cookieStore = await cookies();
  const overrideSlug = cookieStore.get('admin_agency_override')?.value?.trim();
  const envSlug = process.env.NEXT_PUBLIC_AGENCY_SLUG?.trim();
  const host = envSlug ? null : await getRequestHost();

  try {
    let data: AgencyRow | null = null;
    let error: PostgrestError | null = null;

    if (overrideSlug) {
      const res = await supabase
        .from('agencies')
        .select('*')
        .eq('slug', overrideSlug)
        .maybeSingle();
      data = res.data as AgencyRow | null;
      error = res.error;
    } else if (envSlug) {
      const res = await supabase.from('agencies').select('*').eq('slug', envSlug).maybeSingle();
      data = res.data as AgencyRow | null;
      error = res.error;
    } else if (host) {
      const hostNoWww = host.replace(/^www\./, '');
      const candidates = Array.from(new Set([host, hostNoWww, `www.${hostNoWww}`]));

      const res = await supabase
        .from('agencies')
        .select('*')
        .in('domain', candidates)
        .maybeSingle();
      data = res.data as AgencyRow | null;
      error = res.error;

      if (!data) {
        const parts = hostNoWww.split('.');
        const subdomainSlug = parts.length > 2 ? parts[0] : null;
        if (subdomainSlug) {
          const bySlug = await supabase
            .from('agencies')
            .select('*')
            .eq('slug', subdomainSlug)
            .maybeSingle();
          data = bySlug.data as AgencyRow | null;
          error = bySlug.error;
        }
      }
    }

    if (error) {
      console.error('Error fetching agency:', error);
      return null;
    }

    if (!data) {
      const fallback = await supabase
        .from('agencies')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallback.error) {
        console.error('Error fetching fallback agency:', fallback.error);
        return null;
      }

      if (!fallback.data) {
        return null;
      }

      data = fallback.data as AgencyRow;
    }

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      domain: data.domain,
      settings: data.settings || {},
      status: data.status,
      createdAt: data.created_at,
    } as Agency;
  } catch (error) {
    console.error('Unexpected error fetching current agency:', error);
    return null;
  }
});

export const getCurrentAgencySlug = async () => {
  const agency = await getCurrentAgency();
  return agency?.slug || process.env.NEXT_PUBLIC_AGENCY_SLUG || '';
};

/**
 * Helper to get the current Agency ID directly.
 * Throws if no agency is found, as most operations require an agency context.
 */
export const getCurrentAgencyId = cache(async (): Promise<string> => {
  const agency = await getCurrentAgency();
  if (!agency) {
    const host = await getRequestHost();
    throw new Error(
      `Current agency configuration is invalid. Host: ${host ?? 'unknown'} Slug: ${process.env.NEXT_PUBLIC_AGENCY_SLUG ?? 'unset'}`
    );
  }
  return agency.id;
});
