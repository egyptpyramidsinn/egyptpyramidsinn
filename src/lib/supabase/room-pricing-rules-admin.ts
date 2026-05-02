'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/agency-users';
import { getCurrentAgencyId } from '@/lib/supabase/agencies';
import { createClient } from '@/lib/supabase/server';
import type { RoomPricingTier } from '@/types';

const PG_UNDEFINED_TABLE = '42P01';

type PricingRuleRow = {
  id: string;
  agency_id: string;
  hotel_id: string | null;
  room_type_id: string | null;
  min_nights: number;
  discount_percent: string | number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type HotelScopeRow = {
  id: string;
  agency_id: string;
};

type RoomTypeScopeRow = {
  id: string;
  hotel_id: string;
};

export type AdminRoomPricingRule = RoomPricingTier & {
  createdAt: string;
  updatedAt: string;
};

export type ListPricingRulesForAgencyInput = {
  hotelId?: string | null;
  roomTypeId?: string | null;
};

export type CreatePricingRuleInput = {
  agencyId?: string | null;
  hotelId?: string | null;
  roomTypeId?: string | null;
  minNights: number;
  discountPercent: number;
  isActive?: boolean;
  sortOrder?: number;
};

export type UpdatePricingRuleInput = {
  id: string;
  hotelId?: string | null;
  roomTypeId?: string | null;
  minNights?: number;
  discountPercent?: number;
  isActive?: boolean;
  sortOrder?: number;
};

export type DeletePricingRuleInput = {
  id: string;
};

export type TogglePricingRuleActiveInput = {
  id: string;
  isActive: boolean;
};

function isUndefinedTableError(err: unknown): boolean {
  return Boolean(err) && (err as { code?: string }).code === PG_UNDEFINED_TABLE;
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireId(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  return trimmed;
}

function validateMinNights(value: number): number {
  if (!Number.isInteger(value) || value < 2) {
    throw new Error('minNights must be an integer greater than or equal to 2.');
  }
  return value;
}

function validateDiscountPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value >= 100) {
    throw new Error('discountPercent must be greater than 0 and less than 100.');
  }
  return Number(value.toFixed(2));
}

function validateSortOrder(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value)) {
    throw new Error('sortOrder must be an integer.');
  }
  return value;
}

function rowToAdminRule(row: PricingRuleRow): AdminRoomPricingRule {
  return {
    id: row.id,
    agencyId: row.agency_id,
    hotelId: row.hotel_id,
    roomTypeId: row.room_type_id,
    minNights: row.min_nights,
    discountPercent: Number(row.discount_percent),
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies AdminRoomPricingRule;
}

function revalidatePricingRulePages() {
  revalidatePath('/admin/hotels/pricing-rules');
  revalidatePath('/admin/hotels/availability');
  revalidatePath('/rooms/[slug]', 'page');
  revalidatePath('/hotels/[slug]/rooms/[roomSlug]', 'page');
}

async function resolveAgencyId(inputAgencyId?: string | null): Promise<string> {
  const currentAgencyId = await getCurrentAgencyId();
  const requestedAgencyId = normalizeOptionalId(inputAgencyId);

  if (requestedAgencyId && requestedAgencyId !== currentAgencyId) {
    throw new Error('agencyId does not match the current agency context.');
  }

  return currentAgencyId;
}

async function assertHotelInAgency(params: {
  supabase: SupabaseClient;
  agencyId: string;
  hotelId: string;
}) {
  const { data, error } = await params.supabase
    .from('hotels')
    .select('id, agency_id')
    .eq('id', params.hotelId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const hotel = data as HotelScopeRow | null;
  if (!hotel || hotel.agency_id !== params.agencyId) {
    throw new Error('Selected hotel is not part of the current agency.');
  }
}

async function resolveValidatedScope(params: {
  supabase: SupabaseClient;
  agencyId: string;
  hotelId?: string | null;
  roomTypeId?: string | null;
}): Promise<{ hotelId: string | null; roomTypeId: string | null }> {
  const requestedHotelId = normalizeOptionalId(params.hotelId);
  const requestedRoomTypeId = normalizeOptionalId(params.roomTypeId);

  if (!requestedRoomTypeId) {
    if (requestedHotelId) {
      await assertHotelInAgency({
        supabase: params.supabase,
        agencyId: params.agencyId,
        hotelId: requestedHotelId,
      });
    }

    return {
      hotelId: requestedHotelId,
      roomTypeId: null,
    };
  }

  const { data, error } = await params.supabase
    .from('room_types')
    .select('id, hotel_id')
    .eq('id', requestedRoomTypeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const roomType = data as RoomTypeScopeRow | null;
  if (!roomType) {
    throw new Error('Selected room type does not exist.');
  }

  if (requestedHotelId && roomType.hotel_id !== requestedHotelId) {
    throw new Error('Selected room type does not belong to the selected hotel.');
  }

  await assertHotelInAgency({
    supabase: params.supabase,
    agencyId: params.agencyId,
    hotelId: roomType.hotel_id,
  });

  return {
    hotelId: roomType.hotel_id,
    roomTypeId: roomType.id,
  };
}

async function getRuleForAgency(params: {
  supabase: SupabaseClient;
  agencyId: string;
  id: string;
}): Promise<PricingRuleRow> {
  const { data, error } = await params.supabase
    .from('room_pricing_rules')
    .select('*')
    .eq('id', params.id)
    .eq('agency_id', params.agencyId)
    .maybeSingle();

  if (error) {
    if (isUndefinedTableError(error)) {
      throw new Error('room_pricing_rules table is not available.');
    }
    throw error;
  }

  const rule = data as PricingRuleRow | null;
  if (!rule) {
    throw new Error('Pricing rule not found.');
  }

  return rule;
}

export async function listPricingRulesForAgency(
  params: ListPricingRulesForAgencyInput = {}
): Promise<AdminRoomPricingRule[]> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  let query = supabase.from('room_pricing_rules').select('*').eq('agency_id', agencyId);

  const hotelId = normalizeOptionalId(params.hotelId);
  const roomTypeId = normalizeOptionalId(params.roomTypeId);

  if (hotelId) {
    query = query.eq('hotel_id', hotelId);
  }
  if (roomTypeId) {
    query = query.eq('room_type_id', roomTypeId);
  }

  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('min_nights', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    if (isUndefinedTableError(error)) return [];
    throw error;
  }

  return ((data ?? []) as PricingRuleRow[]).map((row) => rowToAdminRule(row));
}

export async function createPricingRule(
  input: CreatePricingRuleInput
): Promise<AdminRoomPricingRule> {
  const supabase = await createAdminClient();
  const agencyId = await resolveAgencyId(input.agencyId);

  const scope = await resolveValidatedScope({
    supabase,
    agencyId,
    hotelId: input.hotelId,
    roomTypeId: input.roomTypeId,
  });

  const minNights = validateMinNights(input.minNights);
  const discountPercent = validateDiscountPercent(input.discountPercent);
  const sortOrder = validateSortOrder(input.sortOrder);

  const { data, error } = await supabase
    .from('room_pricing_rules')
    .insert({
      agency_id: agencyId,
      hotel_id: scope.hotelId,
      room_type_id: scope.roomTypeId,
      min_nights: minNights,
      discount_percent: discountPercent,
      is_active: input.isActive ?? true,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) {
    if (isUndefinedTableError(error)) {
      throw new Error('room_pricing_rules table is not available.');
    }
    throw error;
  }

  const rule = data as PricingRuleRow | null;
  if (!rule) {
    throw new Error('Failed to create pricing rule.');
  }

  revalidatePricingRulePages();
  return rowToAdminRule(rule);
}

export async function updatePricingRule(
  input: UpdatePricingRuleInput
): Promise<AdminRoomPricingRule> {
  const id = requireId(input.id, 'id');
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const existingRule = await getRuleForAgency({ supabase, agencyId, id });

  const nextMinNights =
    input.minNights === undefined ? existingRule.min_nights : validateMinNights(input.minNights);
  const nextDiscountPercent =
    input.discountPercent === undefined
      ? Number(existingRule.discount_percent)
      : validateDiscountPercent(input.discountPercent);
  const nextSortOrder =
    input.sortOrder === undefined ? existingRule.sort_order : validateSortOrder(input.sortOrder);
  const nextIsActive = input.isActive ?? existingRule.is_active;

  const hasHotelId = Object.prototype.hasOwnProperty.call(input, 'hotelId');
  const hasRoomTypeId = Object.prototype.hasOwnProperty.call(input, 'roomTypeId');

  const scope = await resolveValidatedScope({
    supabase,
    agencyId,
    hotelId: hasHotelId ? input.hotelId : existingRule.hotel_id,
    roomTypeId: hasRoomTypeId ? input.roomTypeId : existingRule.room_type_id,
  });

  const { data, error } = await supabase
    .from('room_pricing_rules')
    .update({
      hotel_id: scope.hotelId,
      room_type_id: scope.roomTypeId,
      min_nights: nextMinNights,
      discount_percent: nextDiscountPercent,
      is_active: nextIsActive,
      sort_order: nextSortOrder,
    })
    .eq('id', id)
    .eq('agency_id', agencyId)
    .select('*')
    .single();

  if (error) {
    if (isUndefinedTableError(error)) {
      throw new Error('room_pricing_rules table is not available.');
    }
    throw error;
  }

  const updatedRule = data as PricingRuleRow | null;
  if (!updatedRule) {
    throw new Error('Failed to update pricing rule.');
  }

  revalidatePricingRulePages();
  return rowToAdminRule(updatedRule);
}

export async function deletePricingRule(input: DeletePricingRuleInput): Promise<void> {
  const id = requireId(input.id, 'id');
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const { error } = await supabase
    .from('room_pricing_rules')
    .delete()
    .eq('id', id)
    .eq('agency_id', agencyId);

  if (error) {
    if (isUndefinedTableError(error)) {
      throw new Error('room_pricing_rules table is not available.');
    }
    throw error;
  }

  revalidatePricingRulePages();
}

export async function togglePricingRuleActive(
  input: TogglePricingRuleActiveInput
): Promise<AdminRoomPricingRule> {
  const id = requireId(input.id, 'id');
  if (typeof input.isActive !== 'boolean') {
    throw new Error('isActive must be a boolean value.');
  }

  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('room_pricing_rules')
    .update({ is_active: input.isActive })
    .eq('id', id)
    .eq('agency_id', agencyId)
    .select('*')
    .single();

  if (error) {
    if (isUndefinedTableError(error)) {
      throw new Error('room_pricing_rules table is not available.');
    }
    throw error;
  }

  const updatedRule = data as PricingRuleRow | null;
  if (!updatedRule) {
    throw new Error('Failed to toggle pricing rule state.');
  }

  revalidatePricingRulePages();
  return rowToAdminRule(updatedRule);
}
