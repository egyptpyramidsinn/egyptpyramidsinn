'use server';

import { createClient } from '@/lib/supabase/server';
import { toCamelCase } from '@/lib/utils';
import type { RoomType, Tour } from '@/types';

/**
 * Cross-sell helpers — read-only, server-only. Use the cookie-aware public
 * Supabase client; RLS on the underlying tables (`tours`, `room_types`,
 * `tour_availability`, `room_inventory`) already permits anon SELECT for
 * active rows so no service-role escalation is needed.
 */

type ToursRow = Record<string, unknown>;
type RoomTypeRow = Record<string, unknown>;

export async function getToursOverlappingStay(params: {
  agencyId: string;
  /** ISO date `YYYY-MM-DD`. Inclusive. */
  checkIn: string;
  /** ISO date `YYYY-MM-DD`. Exclusive. */
  checkOut: string;
  limit?: number;
}): Promise<Tour[]> {
  const limit = Math.max(1, Math.min(50, params.limit ?? 6));
  const supabase = await createClient();

  // Tours don't have a single date column in this schema; date intersection
  // is done via `tour_availability.date ∈ [checkIn, checkOut)` joined back to
  // active tours. We do the join in two steps to avoid relying on an
  // unconfirmed PostgREST FK relationship.
  const { data: avail, error: availErr } = await supabase
    .from('tour_availability')
    .select('tour_id, date, is_blocked')
    .eq('agency_id', params.agencyId)
    .gte('date', params.checkIn)
    .lt('date', params.checkOut)
    .eq('is_blocked', false)
    .limit(500);

  if (availErr) {
    console.error('[cross-sell] tour_availability error:', availErr);
    return [];
  }

  const tourIds = Array.from(new Set((avail ?? []).map((r) => (r as { tour_id: string }).tour_id)));
  if (tourIds.length === 0) return [];

  const { data: tours, error: tourErr } = await supabase
    .from('tours')
    .select('*')
    .eq('agency_id', params.agencyId)
    .eq('availability', true)
    .in('id', tourIds)
    .limit(limit);

  if (tourErr) {
    console.error('[cross-sell] tours error:', tourErr);
    return [];
  }

  return ((tours ?? []) as ToursRow[]).map((row) => toCamelCase(row) as Tour);
}

export async function getRoomsForTourDate(params: {
  agencyId: string;
  hotelId?: string;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  limit?: number;
}): Promise<RoomType[]> {
  const limit = Math.max(1, Math.min(50, params.limit ?? 6));
  const supabase = await createClient();

  // Active hotels in the agency (optionally narrowed to one hotel).
  let hotelQuery = supabase
    .from('hotels')
    .select('id')
    .eq('agency_id', params.agencyId)
    .eq('is_active', true);
  if (params.hotelId) hotelQuery = hotelQuery.eq('id', params.hotelId);
  const { data: hotelRows, error: hotelErr } = await hotelQuery;
  if (hotelErr) {
    console.error('[cross-sell] hotels error:', hotelErr);
    return [];
  }
  const hotelIds = (hotelRows ?? []).map((r) => (r as { id: string }).id);
  if (hotelIds.length === 0) return [];

  const { data: rooms, error: roomErr } = await supabase
    .from('room_types')
    .select('*')
    .in('hotel_id', hotelIds)
    .eq('is_active', true)
    .limit(limit * 4); // over-fetch; we filter by inventory next

  if (roomErr) {
    console.error('[cross-sell] room_types error:', roomErr);
    return [];
  }

  const candidateIds = ((rooms ?? []) as RoomTypeRow[]).map((r) => String(r.id));
  if (candidateIds.length === 0) return [];

  // Inventory rows for that single date — only consider rooms with an
  // explicit availability row that is open and has at least one unit.
  const { data: inv, error: invErr } = await supabase
    .from('room_inventory')
    .select('room_type_id, available_units, stop_sell')
    .in('room_type_id', candidateIds)
    .eq('date', params.date);

  if (invErr) {
    console.error('[cross-sell] room_inventory error:', invErr);
  }

  // A room is shown when EITHER it has an open inventory row (>=1 unit) OR
  // there is no inventory row for that date (defaults to base availability).
  const blocked = new Set<string>();
  const ok = new Set<string>();
  for (const row of (inv ?? []) as Array<{
    room_type_id: string;
    available_units: number | null;
    stop_sell: boolean | null;
  }>) {
    if (row.stop_sell || (row.available_units ?? 0) < 1) {
      blocked.add(row.room_type_id);
    } else {
      ok.add(row.room_type_id);
    }
  }

  const filtered = ((rooms ?? []) as RoomTypeRow[])
    .filter((r) => !blocked.has(String(r.id)))
    .filter((r) => ok.has(String(r.id)) || true) // base availability fallback
    .slice(0, limit);

  return filtered.map((row) => toCamelCase(row) as RoomType);
}

export async function getRelatedRooms(params: {
  agencyId: string;
  hotelId: string;
  excludeRoomTypeId: string;
  limit?: number;
}): Promise<RoomType[]> {
  const limit = Math.max(1, Math.min(20, params.limit ?? 4));
  const supabase = await createClient();

  // Confirm hotel belongs to the agency (defence in depth — RLS already
  // enforces public-active reads).
  const { data: hotel, error: hotelErr } = await supabase
    .from('hotels')
    .select('id')
    .eq('id', params.hotelId)
    .eq('agency_id', params.agencyId)
    .eq('is_active', true)
    .maybeSingle();
  if (hotelErr || !hotel) return [];

  const { data, error } = await supabase
    .from('room_types')
    .select('*')
    .eq('hotel_id', params.hotelId)
    .eq('is_active', true)
    .neq('id', params.excludeRoomTypeId)
    .order('is_featured', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[cross-sell] getRelatedRooms error:', error);
    return [];
  }
  return ((data ?? []) as RoomTypeRow[]).map((row) => toCamelCase(row) as RoomType);
}
