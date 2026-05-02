'use server';

import { createClient } from '@/lib/supabase/server';
import { toCamelCase } from '@/lib/utils';
import { getApplicableTier } from '@/lib/supabase/room-pricing-rules';
import { getActiveHeldUnits } from '@/lib/supabase/cart-holds';
import {
  RoomPricingError,
  type RoomAddon,
  type RoomAvailabilityNight,
  type RoomAvailabilityNightStatus,
  type RoomAvailabilityRange,
  type RoomInventory,
  type RoomPriceQuote,
  type RoomPriceQuoteNight,
  type RoomType,
} from '@/types';

/**
 * Input for `getRoomPriceQuote`.
 *
 * Date strings are interpreted as `YYYY-MM-DD` (timezone-naive). The stay
 * covers `[checkIn, checkOut)` — checkout day is NOT priced.
 */
export type RoomPriceQuoteInput = {
  roomTypeId: string;
  /** ISO date `YYYY-MM-DD`. Inclusive. */
  checkIn: string;
  /** ISO date `YYYY-MM-DD`. Exclusive. */
  checkOut: string;
  adults: number;
  children?: number;
  units: number;
  /** Optional: caller's session id; held units owned by this session are
   * NOT counted against availability. Best-effort, not a security signal. */
  excludeSessionId?: string;
  /** Optional: caller's own line id; the user's own existing hold is not
   * counted against availability when re-quoting. */
  excludeLineId?: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDateUtc(value: string): Date {
  if (!ISO_DATE_RE.test(value)) {
    throw new RoomPricingError('INVALID_INPUT', `Invalid date format: ${value}`);
  }
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new RoomPricingError('INVALID_INPUT', `Invalid date: ${value}`);
  }
  return d;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eachNightBetween(checkIn: Date, checkOut: Date): string[] {
  const nights: string[] = [];
  const cursor = new Date(checkIn.getTime());
  while (cursor.getTime() < checkOut.getTime()) {
    nights.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return nights;
}

function roundCurrency(value: number): number {
  // Two-decimal half-away-from-zero rounding for currency math.
  return Math.round(value * 100) / 100;
}

function normalizeUnitCapacity(value: number | null | undefined): number {
  const units = Math.trunc(Number(value ?? 1));
  return Number.isFinite(units) && units >= 1 ? units : 1;
}

function getEffectiveAvailableUnits(params: {
  inventory: RoomInventory | undefined;
  defaultUnits: number;
  heldUnits: number;
}): number {
  const configuredUnits =
    params.inventory && Number.isFinite(Number(params.inventory.availableUnits))
      ? Math.max(0, Math.trunc(Number(params.inventory.availableUnits)))
      : params.defaultUnits;

  return Math.max(0, configuredUnits - params.heldUnits);
}

/**
 * Compute a server-side price quote for a room over a date range.
 *
 * - Pure read; never mutates data.
 * - Uses the room type's USD `base_price_per_night` for every priced night;
 *   display conversion stays in the existing app currency flow.
 * - Honors `stop_sell` and per-night `available_units` against requested units.
 * - Honors per-night `min_nights`: if any covered night requires more nights
 *   than the stay length, it is reported under `minNightsViolations` and the
 *   quote is marked unavailable.
 *
 * Throws `RoomPricingError` for invalid input, missing/inactive room, or
 * capacity-exceeding guest counts.
 */
export async function getRoomPriceQuote(input: RoomPriceQuoteInput): Promise<RoomPriceQuote> {
  const adults = Math.trunc(input.adults);
  const children = Math.trunc(input.children ?? 0);
  const units = Math.trunc(input.units);

  if (!input.roomTypeId) {
    throw new RoomPricingError('INVALID_INPUT', 'roomTypeId is required.');
  }
  if (!Number.isFinite(adults) || adults < 1) {
    throw new RoomPricingError('INVALID_INPUT', 'adults must be >= 1.');
  }
  if (!Number.isFinite(children) || children < 0) {
    throw new RoomPricingError('INVALID_INPUT', 'children must be >= 0.');
  }
  if (!Number.isFinite(units) || units < 1) {
    throw new RoomPricingError('INVALID_INPUT', 'units must be >= 1.');
  }

  const checkInDate = parseIsoDateUtc(input.checkIn);
  const checkOutDate = parseIsoDateUtc(input.checkOut);
  if (checkOutDate.getTime() <= checkInDate.getTime()) {
    throw new RoomPricingError('INVALID_INPUT', 'checkOut must be after checkIn.');
  }

  const supabase = await createClient();

  const { data: roomRow, error: roomErr } = await supabase
    .from('room_types')
    .select('*')
    .eq('id', input.roomTypeId)
    .maybeSingle();

  if (roomErr) throw roomErr;
  if (!roomRow) {
    throw new RoomPricingError('NOT_FOUND', `Room type ${input.roomTypeId} not found.`);
  }

  const room = toCamelCase(roomRow) as RoomType;
  if (!room.isActive) {
    throw new RoomPricingError('INACTIVE', `Room type ${room.slug} is not active.`);
  }

  // Fetch the owning agency_id for tier-rule lookup. Cheap & cached at the
  // PostgREST layer; failures fall back to "no tier".
  let agencyId: string | null = null;
  if (room.hotelId) {
    const { data: hotelRow } = await supabase
      .from('hotels')
      .select('agency_id')
      .eq('id', room.hotelId)
      .maybeSingle();
    agencyId = (hotelRow as { agency_id?: string } | null)?.agency_id ?? null;
  }

  // Per-room capacity is per-unit; total capacity scales with units booked.
  if (adults > room.maxAdults * units) {
    throw new RoomPricingError(
      'OVER_CAPACITY',
      `Room allows at most ${room.maxAdults} adults per unit (${units} unit${units === 1 ? '' : 's'} requested).`
    );
  }
  if (children > room.maxChildren * units) {
    throw new RoomPricingError(
      'OVER_CAPACITY',
      `Room allows at most ${room.maxChildren} children per unit (${units} unit${units === 1 ? '' : 's'} requested).`
    );
  }

  const basePrice = Number(room.basePricePerNight ?? 0);
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    throw new RoomPricingError(
      'INVALID_INPUT',
      `Room type ${room.slug} has no base_price_per_night configured.`
    );
  }
  const currency = 'USD';
  const defaultUnits = normalizeUnitCapacity(room.defaultUnits);

  const nightDates = eachNightBetween(checkInDate, checkOutDate);
  const nights = nightDates.length;

  const { data: inventoryRows, error: invErr } = await supabase
    .from('room_inventory')
    .select('*')
    .eq('room_type_id', input.roomTypeId)
    .gte('date', input.checkIn)
    .lt('date', input.checkOut);

  if (invErr) throw invErr;

  const inventoryByDate = new Map<string, RoomInventory>();
  for (const row of inventoryRows ?? []) {
    const inv = toCamelCase(row) as RoomInventory;
    inventoryByDate.set(inv.date, inv);
  }

  // Best-effort: per-night map of currently-held units (excluding the
  // caller's own session/line). When the cart_holds table is missing or
  // empty, all entries are 0 and the subtraction is a no-op.
  const heldByDate = new Map<string, number>();
  await Promise.all(
    nightDates.map(async (date) => {
      const held = await getActiveHeldUnits({
        roomTypeId: input.roomTypeId,
        date,
        excludeSessionId: input.excludeSessionId,
        excludeLineId: input.excludeLineId,
      });
      heldByDate.set(date, held);
    })
  );

  const perNightBreakdown: RoomPriceQuoteNight[] = [];
  const unavailableDates: string[] = [];
  const minNightsViolations: Array<{ date: string; minNights: number }> = [];

  for (const date of nightDates) {
    const inv = inventoryByDate.get(date);
    const price = basePrice;
    const usedInventoryOverride = false;
    let available = true;
    let availableUnits = defaultUnits;
    let minNights: number | null = null;
    const held = heldByDate.get(date) ?? 0;

    availableUnits = getEffectiveAvailableUnits({
      inventory: inv,
      defaultUnits,
      heldUnits: held,
    });

    if (inv) {
      minNights = inv.minNights ?? null;

      if (inv.stopSell) {
        available = false;
      }
    }

    if (availableUnits < units) {
      available = false;
    }

    if (typeof minNights === 'number' && minNights > nights) {
      minNightsViolations.push({ date, minNights });
    }

    if (!available) unavailableDates.push(date);

    perNightBreakdown.push({
      date,
      price: roundCurrency(price),
      available,
      minNights,
      availableUnits,
      usedInventoryOverride,
    });
  }

  const stayCostPerUnit = perNightBreakdown.reduce((acc, n) => acc + n.price, 0);
  const subtotalBeforeTier = roundCurrency(stayCostPerUnit * units);
  const pricePerNightAvg = nights > 0 ? roundCurrency(stayCostPerUnit / nights) : 0;

  // Stay-length tier discount applies to the per-night portion only (NOT
  // to addons; addons are not part of the room price quote subtotal).
  const tier = await getApplicableTier({
    agencyId: agencyId ?? '',
    hotelId: room.hotelId,
    roomTypeId: room.id,
    nights,
  }).catch(() => null);

  let tierDiscountAmount = 0;
  let subtotal = subtotalBeforeTier;
  if (tier) {
    tierDiscountAmount = roundCurrency((subtotalBeforeTier * tier.discountPercent) / 100);
    subtotal = roundCurrency(subtotalBeforeTier - tierDiscountAmount);
  }

  const isAvailable = unavailableDates.length === 0 && minNightsViolations.length === 0;

  return {
    roomTypeId: room.id,
    hotelId: room.hotelId,
    roomSlug: room.slug,
    name: room.name,
    currency,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults,
    children,
    units,
    nights,
    basePricePerNight: roundCurrency(basePrice),
    pricePerNightAvg,
    subtotalBeforeTier,
    tierDiscountAmount,
    tier: tier
      ? { id: tier.id, minNights: tier.minNights, discountPercent: tier.discountPercent }
      : null,
    subtotal,
    perNightBreakdown,
    isAvailable,
    unavailableDates,
    minNightsViolations,
  };
}

/**
 * Server action wrapper. Plain re-export of `getRoomPriceQuote`; this module
 * is already `'use server'`, so client forms can call it directly without
 * any additional plumbing.
 */
export async function getRoomPriceQuoteAction(input: RoomPriceQuoteInput): Promise<RoomPriceQuote> {
  return getRoomPriceQuote(input);
}

/** Postgres "undefined table" error code. Used to gracefully degrade when
 * the optional `room_addons` migration has not yet been applied. */
const PG_UNDEFINED_TABLE = '42P01';

/**
 * Fetch active room addons for a room type. Returns `[]` if the optional
 * `room_addons` table does not exist yet (migration unapplied).
 */
export async function getRoomAddons(roomTypeId: string): Promise<RoomAddon[]> {
  if (!roomTypeId) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('room_addons')
    .select('*')
    .eq('room_type_id', roomTypeId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === PG_UNDEFINED_TABLE) {
      // Schema not yet migrated; surface an empty list so the UI is unblocked.
      return [];
    }
    throw error;
  }

  return (data ?? []).map((row) => toCamelCase(row) as RoomAddon);
}

/** Maximum number of nights returned by `getRoomAvailabilityRange` in a single call. */
const AVAILABILITY_RANGE_MAX_DAYS = 90;

export type RoomAvailabilityRangeInput = {
  roomTypeId: string;
  /** ISO date `YYYY-MM-DD`. Inclusive. */
  from: string;
  /** ISO date `YYYY-MM-DD`. Exclusive. */
  to: string;
};

function classifyNight(
  inv: RoomInventory | undefined,
  defaultUnits: number
): RoomAvailabilityNightStatus {
  if (!inv) {
    if (defaultUnits <= 0) return 'sold_out';
    if (defaultUnits <= 2) return 'low';
    return 'available';
  }
  if (inv.stopSell) return 'stop_sell';
  const units = inv.availableUnits;
  if (typeof units !== 'number') return 'unknown';
  if (units <= 0) return 'sold_out';
  if (units <= 2) return 'low';
  return 'available';
}

/**
 * Read-only availability snapshot for a room type over `[from, to)`.
 *
 * Used to drive the smart-calendar UI: every date in the requested window
 * is returned, including dates with no `room_inventory` row (availability
 * falls back to the room type's `default_units` and base price).
 *
 * Throws `RoomPricingError`:
 * - `INVALID_INPUT` for malformed dates or `to <= from`.
 * - `RANGE_TOO_LARGE` when the requested window exceeds 90 days.
 * - `NOT_FOUND` when the room type does not exist.
 */
export async function getRoomAvailabilityRange(
  input: RoomAvailabilityRangeInput
): Promise<RoomAvailabilityRange> {
  if (!input.roomTypeId) {
    throw new RoomPricingError('INVALID_INPUT', 'roomTypeId is required.');
  }
  const fromDate = parseIsoDateUtc(input.from);
  const toDate = parseIsoDateUtc(input.to);
  if (toDate.getTime() <= fromDate.getTime()) {
    throw new RoomPricingError('INVALID_INPUT', '`to` must be after `from`.');
  }

  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
  if (days > AVAILABILITY_RANGE_MAX_DAYS) {
    throw new RoomPricingError(
      'RANGE_TOO_LARGE',
      `Availability range is limited to ${AVAILABILITY_RANGE_MAX_DAYS} days (got ${days}).`
    );
  }

  const supabase = await createClient();

  const { data: roomRow, error: roomErr } = await supabase
    .from('room_types')
    .select(
      'id, base_price_per_night, currency, default_units, max_adults, max_children, is_active'
    )
    .eq('id', input.roomTypeId)
    .maybeSingle();

  if (roomErr) throw roomErr;
  if (!roomRow) {
    throw new RoomPricingError('NOT_FOUND', `Room type ${input.roomTypeId} not found.`);
  }

  const room = toCamelCase(roomRow) as Pick<
    RoomType,
    'basePricePerNight' | 'currency' | 'defaultUnits' | 'maxAdults' | 'maxChildren' | 'isActive'
  >;

  const baseCurrency = 'USD';
  const defaultUnits = normalizeUnitCapacity(room.defaultUnits);
  const basePrice =
    room.basePricePerNight != null && Number.isFinite(Number(room.basePricePerNight))
      ? Number(room.basePricePerNight)
      : null;

  const { data: inventoryRows, error: invErr } = await supabase
    .from('room_inventory')
    .select('*')
    .eq('room_type_id', input.roomTypeId)
    .gte('date', input.from)
    .lt('date', input.to);

  if (invErr) throw invErr;

  const inventoryByDate = new Map<string, RoomInventory>();
  for (const row of inventoryRows ?? []) {
    const inv = toCamelCase(row) as RoomInventory;
    inventoryByDate.set(inv.date, inv);
  }

  const nights: RoomAvailabilityNight[] = [];
  const cursor = new Date(fromDate.getTime());
  while (cursor.getTime() < toDate.getTime()) {
    const dateStr = toIsoDate(cursor);
    const inv = inventoryByDate.get(dateStr);
    const status = classifyNight(inv, defaultUnits);

    nights.push({
      date: dateStr,
      status,
      availableUnits: inv ? inv.availableUnits : defaultUnits,
      pricePerNight: basePrice,
      currency: baseCurrency,
      minNights: inv?.minNights ?? null,
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    nights,
    roomDefaults: {
      basePricePerNight: basePrice,
      currency: baseCurrency,
      defaultUnits,
      maxAdults: room.maxAdults,
      maxChildren: room.maxChildren,
      isActive: room.isActive,
    },
    from: input.from,
    to: input.to,
  };
}
