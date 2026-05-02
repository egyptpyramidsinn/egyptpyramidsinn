'use server';

import { getCurrentAgencyId as _getCurrentAgencyId } from '@/lib/supabase/agencies';

/**
 * Server action wrapper around `getCurrentAgencyId` so client components
 * (e.g. checkout, cart cross-sell) can resolve the active agency id from
 * the request host without bundling server modules.
 */
export async function getCurrentAgencyIdAction(): Promise<string | null> {
  try {
    return await _getCurrentAgencyId();
  } catch {
    return null;
  }
}
