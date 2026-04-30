'use server';

import { createClient, createPublicClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/agency-users';
import { getCurrentAgencyId } from '@/lib/supabase/agencies';
import { toCamelCase } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import type { TourDateAvailability } from '@/types';

// ─── Admin: Get all availability records for a tour ─────────────────────────
export async function getTourAvailability(tourId: string): Promise<TourDateAvailability[]> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('tour_availability')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching tour availability:', error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) =>
    toCamelCase(row)
  ) as TourDateAvailability[];
}

// ─── Public: Get availability for a tour (customer-facing) ──────────────────
export async function getPublicTourAvailability(tourId: string): Promise<TourDateAvailability[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tour_availability')
    .select('*')
    .eq('tour_id', tourId)
    .gte('date', new Date().toISOString().split('T')[0]) // only future dates
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching public tour availability:', error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) =>
    toCamelCase(row)
  ) as TourDateAvailability[];
}

// ─── Admin: Set availability for a single date ──────────────────────────────
export async function setDateAvailability(data: {
  tourId: string;
  date: string; // YYYY-MM-DD
  availableSpots: number | null;
  isBlocked: boolean;
}) {
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  // Upsert: insert or update if tour_id+date already exists
  const { error } = await supabase.from('tour_availability').upsert(
    {
      agency_id: agencyId,
      tour_id: data.tourId,
      date: data.date,
      available_spots: data.availableSpots,
      is_blocked: data.isBlocked,
    },
    { onConflict: 'tour_id,date' }
  );

  if (error) {
    console.error('Error setting date availability:', error);
    throw new Error('Failed to set date availability.');
  }

  revalidatePath('/admin/tours');
  revalidatePath('/tours');
}

// ─── Admin: Bulk set availability for multiple dates ────────────────────────
export async function bulkSetAvailability(data: {
  tourId: string;
  dates: {
    date: string;
    availableSpots: number | null;
    isBlocked: boolean;
  }[];
}) {
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const rows = data.dates.map((d) => ({
    agency_id: agencyId,
    tour_id: data.tourId,
    date: d.date,
    available_spots: d.availableSpots,
    is_blocked: d.isBlocked,
  }));

  const { error } = await supabase
    .from('tour_availability')
    .upsert(rows, { onConflict: 'tour_id,date' });

  if (error) {
    console.error('Error bulk setting availability:', error);
    throw new Error('Failed to set availability.');
  }

  revalidatePath('/admin/tours');
  revalidatePath('/tours');
}

// ─── Admin: Remove availability record (resets to default/unlimited) ────────
export async function removeDateAvailability(tourId: string, date: string) {
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const { error } = await supabase
    .from('tour_availability')
    .delete()
    .eq('agency_id', agencyId)
    .eq('tour_id', tourId)
    .eq('date', date);

  if (error) {
    console.error('Error removing date availability:', error);
    throw new Error('Failed to remove date availability.');
  }

  revalidatePath('/admin/tours');
  revalidatePath('/tours');
}

// ─── Checkout: Check availability for a tour on a specific date ─────────────
export async function checkTourDateAvailability(
  tourId: string,
  date: string, // YYYY-MM-DD
  requiredSpots: number
): Promise<{ available: boolean; reason?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tour_availability')
    .select('*')
    .eq('tour_id', tourId)
    .eq('date', date)
    .single();

  // No record = no restrictions = available
  if (error || !data) {
    return { available: true };
  }

  if (data.is_blocked) {
    return { available: false, reason: 'This date is blocked and not available for booking.' };
  }

  if (data.available_spots !== null && data.available_spots < requiredSpots) {
    return {
      available: false,
      reason: `Only ${data.available_spots} spot${data.available_spots === 1 ? '' : 's'} remaining on this date.`,
    };
  }

  return { available: true };
}

// ─── Checkout: Decrement available spots after a successful booking ─────────
export async function decrementAvailableSpots(tourId: string, date: string, count: number) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('tour_availability')
    .select('available_spots')
    .eq('tour_id', tourId)
    .eq('date', date)
    .single();

  // No record or unlimited spots — nothing to decrement
  if (!data || data.available_spots === null) return;

  const newSpots = Math.max(0, data.available_spots - count);

  await supabase
    .from('tour_availability')
    .update({ available_spots: newSpots })
    .eq('tour_id', tourId)
    .eq('date', date);
}

// ─── Search: Get tour IDs that are available on a specific date ─────────────
export async function getToursAvailableOnDate(
  date: string, // YYYY-MM-DD
  tourIds: string[]
): Promise<string[] | null> {
  if (tourIds.length === 0) return [];

  const supabase = createPublicClient();

  // Avoid oversized `.in()` URLs on large result sets by querying in chunks.
  const CHUNK_SIZE = 100;
  const blockedIds = new Set<string>();

  for (let i = 0; i < tourIds.length; i += CHUNK_SIZE) {
    const chunk = tourIds.slice(i, i + CHUNK_SIZE);

    const { data, error } = await supabase
      .from('tour_availability')
      .select('tour_id, available_spots, is_blocked')
      .in('tour_id', chunk)
      .eq('date', date);

    if (error) {
      console.warn('Skipping tour date availability filter:', error.message);
      return null; // null = skip filtering
    }

    for (const row of (data ?? []) as Array<{
      tour_id: string;
      available_spots: number | null;
      is_blocked: boolean;
    }>) {
      if (row.is_blocked || row.available_spots === 0) {
        blockedIds.add(row.tour_id);
      }
    }
  }

  return tourIds.filter((id) => !blockedIds.has(id));
}

// ─── Search: Get availability status for tours on a specific date ───────────
export type TourDateStatus =
  | { status: 'available' }
  | { status: 'limited'; spots: number }
  | { status: 'soldout' }
  | { status: 'unrestricted' };

export async function getTourDateStatusMap(
  date: string,
  tourIds: string[]
): Promise<Record<string, TourDateStatus>> {
  const result: Record<string, TourDateStatus> = {};
  if (tourIds.length === 0) return result;

  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from('tour_availability')
    .select('tour_id, available_spots, is_blocked')
    .in('tour_id', tourIds)
    .eq('date', date);

  if (error) {
    console.warn('Skipping tour date status map:', error.message);
    return result;
  }

  const seen = new Set<string>();
  for (const row of (data ?? []) as Array<{
    tour_id: string;
    available_spots: number | null;
    is_blocked: boolean;
  }>) {
    seen.add(row.tour_id);
    if (row.is_blocked) {
      result[row.tour_id] = { status: 'soldout' };
    } else if (row.available_spots === null) {
      result[row.tour_id] = { status: 'unrestricted' };
    } else if (row.available_spots <= 0) {
      result[row.tour_id] = { status: 'soldout' };
    } else if (row.available_spots <= 5) {
      result[row.tour_id] = { status: 'limited', spots: row.available_spots };
    } else {
      result[row.tour_id] = { status: 'available' };
    }
  }
  for (const id of tourIds) {
    if (!seen.has(id)) result[id] = { status: 'unrestricted' };
  }
  return result;
}
