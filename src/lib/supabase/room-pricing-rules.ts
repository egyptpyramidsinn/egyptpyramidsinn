'use server';

import { createClient } from '@/lib/supabase/server';
import type { RoomPricingTier } from '@/types';

/**
 * Pricing-tiers helper. The `room_pricing_rules` table is created by
 * migration `20260503090000_create_room_pricing_rules.sql`. To keep
 * deployments that have not yet applied the migration functional, every
 * exported helper returns a no-tier value when Postgres reports the table
 * is undefined (`42P01`).
 */
const PG_UNDEFINED_TABLE = '42P01';

type Row = {
  id: string;
  agency_id: string;
  hotel_id: string | null;
  room_type_id: string | null;
  min_nights: number;
  discount_percent: string | number;
  is_active: boolean;
  sort_order: number;
};

function rowToTier(row: Row): RoomPricingTier {
  return {
    id: row.id,
    agencyId: row.agency_id,
    hotelId: row.hotel_id,
    roomTypeId: row.room_type_id,
    minNights: row.min_nights,
    discountPercent: Number(row.discount_percent),
    isActive: row.is_active,
    sortOrder: row.sort_order,
  } satisfies RoomPricingTier;
}

function isUndefinedTableError(err: unknown): boolean {
  return Boolean(err) && (err as { code?: string }).code === PG_UNDEFINED_TABLE;
}

/**
 * Specificity score: room_type match > hotel match > agency-only.
 * Within the same specificity, the rule with the highest `min_nights`
 * (closest to but not exceeding `nights`) wins.
 */
function scoreSpecificity(
  rule: RoomPricingTier,
  hotelId: string | null,
  roomTypeId: string | null
): number {
  if (rule.roomTypeId && rule.roomTypeId === roomTypeId) return 3;
  if (rule.hotelId && rule.hotelId === hotelId) return 2;
  if (!rule.hotelId && !rule.roomTypeId) return 1;
  return 0; // mismatched scope → not applicable
}

export async function getApplicableTier(params: {
  agencyId: string;
  hotelId: string | null;
  roomTypeId: string | null;
  nights: number;
}): Promise<RoomPricingTier | null> {
  if (!params.agencyId || params.nights < 2) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('room_pricing_rules')
    .select('*')
    .eq('agency_id', params.agencyId)
    .eq('is_active', true)
    .lte('min_nights', params.nights);

  if (error) {
    if (isUndefinedTableError(error)) return null;
    throw error;
  }

  const rules = (data ?? []).map((row) => rowToTier(row as unknown as Row));

  let best: RoomPricingTier | null = null;
  let bestScore = 0;
  let bestMinNights = -1;

  for (const r of rules) {
    const score = scoreSpecificity(r, params.hotelId, params.roomTypeId);
    if (score === 0) continue;
    if (score > bestScore || (score === bestScore && r.minNights > bestMinNights)) {
      best = r;
      bestScore = score;
      bestMinNights = r.minNights;
    }
  }

  return best;
}

export async function listActiveTiers(params: {
  agencyId: string;
  hotelId?: string | null;
  roomTypeId?: string | null;
}): Promise<RoomPricingTier[]> {
  if (!params.agencyId) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('room_pricing_rules')
    .select('*')
    .eq('agency_id', params.agencyId)
    .eq('is_active', true)
    .order('min_nights', { ascending: true });

  if (error) {
    if (isUndefinedTableError(error)) return [];
    throw error;
  }

  const rules = (data ?? []).map((row) => rowToTier(row as unknown as Row));
  // Filter to those that could apply for the requested scope.
  return rules.filter((r) => {
    if (r.roomTypeId) return r.roomTypeId === (params.roomTypeId ?? null);
    if (r.hotelId) return r.hotelId === (params.hotelId ?? null);
    return true; // agency-only rules apply everywhere
  });
}
