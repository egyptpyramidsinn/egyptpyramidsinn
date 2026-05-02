'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/agency-users';
import { getCurrentAgencyId } from '@/lib/supabase/agencies';
import { toCamelCase } from '@/lib/utils';
import type {
  AdminHotelBooking,
  Hotel,
  HotelBooking,
  HotelBookingStatus,
  HotelDashboardOperationsSummary,
  RoomInventory,
  RoomType,
} from '@/types';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicTargetLocale } from '@/lib/translation/get-locale';
import { translateObject, translateObjects } from '@/lib/translation/translate-object';

const HOTEL_TRANSLATABLE_FIELDS = ['name', 'description'] as const;
const HOTEL_BOOKING_STATUSES = ['pending', 'paid', 'confirmed', 'cancelled'] as const;
const HOTEL_BOOKING_SELECT =
  'id, agency_id, hotel_id, room_type_id, check_in, check_out, units, guests_adults, guests_children, guest_name, guest_email, guest_phone, status, payment_provider, payment_reference, subtotal, tax, fees, total, created_at, updated_at';
const HOTEL_BOOKING_STATUS_SELECT =
  'id, agency_id, hotel_id, room_type_id, check_in, check_out, units, status';
const ROOM_TYPE_TRANSLATABLE_FIELDS = [
  'name',
  'description',
  'view',
  'cancellationPolicy',
  'amenities[]',
  'services[]',
  'highlights[]',
] as const;

type SkipOpt = { skipTranslation?: boolean };

type HotelBookingRow = {
  id: string;
  agency_id: string;
  hotel_id: string;
  room_type_id: string;
  check_in: string;
  check_out: string;
  units: number | string | null;
  guests_adults: number | string | null;
  guests_children: number | string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  status: string | null;
  payment_provider: string | null;
  payment_reference: string | null;
  subtotal: number | string | null;
  tax: number | string | null;
  fees: number | string | null;
  total: number | string | null;
  created_at: string;
  updated_at: string;
};

type HotelBookingStatusRow = Pick<
  HotelBookingRow,
  'id' | 'agency_id' | 'hotel_id' | 'room_type_id' | 'check_in' | 'check_out' | 'units' | 'status'
>;

type HotelBookingDisplayRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

type RoomTypeDisplayRow = HotelBookingDisplayRow & {
  hotel_id: string | null;
};

type HotelBookingSummaryRow = {
  status: string | null;
  check_in: string | null;
  total: number | string | null;
};

type RoomInventoryRpcArgs = {
  p_room_type_id: string;
  p_check_in: string;
  p_check_out: string;
  p_units: number;
};

type BookingDisplayLookups = {
  hotelsById: Map<string, HotelBookingDisplayRow>;
  roomTypesById: Map<string, RoomTypeDisplayRow>;
};

async function maybeTranslateHotels(hotels: Hotel[], skip?: boolean): Promise<Hotel[]> {
  if (skip) return hotels;
  const target = await getPublicTargetLocale();
  if (target === 'en') return hotels;
  return translateObjects(hotels, HOTEL_TRANSLATABLE_FIELDS, target);
}

async function maybeTranslateHotel(hotel: Hotel | null, skip?: boolean): Promise<Hotel | null> {
  if (!hotel || skip) return hotel;
  const target = await getPublicTargetLocale();
  if (target === 'en') return hotel;
  return translateObject(hotel, HOTEL_TRANSLATABLE_FIELDS, target);
}

async function maybeTranslateRoomTypes(rooms: RoomType[], skip?: boolean): Promise<RoomType[]> {
  if (skip) return rooms;
  const target = await getPublicTargetLocale();
  if (target === 'en') return rooms;
  return translateObjects(rooms, ROOM_TYPE_TRANSLATABLE_FIELDS, target);
}

async function maybeTranslateRoomType(
  room: RoomType | null,
  skip?: boolean
): Promise<RoomType | null> {
  if (!room || skip) return room;
  const target = await getPublicTargetLocale();
  if (target === 'en') return room;
  return translateObject(room, ROOM_TYPE_TRANSLATABLE_FIELDS, target);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeRoomUnitCapacity(value: number | null | undefined): number {
  const units = Math.trunc(Number(value ?? 1));
  return Number.isFinite(units) && units >= 1 ? units : 1;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Unknown error.';
}

function isHotelBookingStatus(value: string): value is HotelBookingStatus {
  return (HOTEL_BOOKING_STATUSES as readonly string[]).includes(value);
}

function normalizeHotelBookingStatus(value: unknown): HotelBookingStatus {
  if (typeof value === 'string' && isHotelBookingStatus(value)) return value;
  throw new Error('Invalid hotel booking status.');
}

function isActiveHotelBookingStatus(status: HotelBookingStatus): boolean {
  return status !== 'cancelled';
}

function normalizeBookedUnits(value: number | string | null | undefined): number {
  const units = Math.trunc(Number(value ?? 0));
  if (!Number.isFinite(units) || units < 1) {
    throw new Error('Room booking units must be >= 1.');
  }
  return units;
}

function getHotelBookingInventoryArgs(row: HotelBookingStatusRow): RoomInventoryRpcArgs {
  if (!row.room_type_id || !row.check_in || !row.check_out) {
    throw new Error(`Hotel booking ${row.id} is missing room inventory fields.`);
  }

  return {
    p_room_type_id: row.room_type_id,
    p_check_in: row.check_in,
    p_check_out: row.check_out,
    p_units: normalizeBookedUnits(row.units),
  };
}

async function callRoomInventoryRpc(
  supabase: SupabaseClient,
  functionName: 'reserve_room_inventory' | 'release_room_inventory',
  args: RoomInventoryRpcArgs,
  failureMessage: string
): Promise<void> {
  const { error } = await supabase.rpc(functionName, args);
  if (error) {
    throw new Error(`${failureMessage}: ${getErrorMessage(error)}`);
  }
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function loadBookingDisplayLookups(
  supabase: SupabaseClient,
  agencyId: string,
  bookings: HotelBookingRow[]
): Promise<BookingDisplayLookups> {
  const hotelIds = uniqueNonEmpty(bookings.map((booking) => booking.hotel_id));
  const roomTypeIds = uniqueNonEmpty(bookings.map((booking) => booking.room_type_id));

  const [hotelsRes, roomTypesRes] = await Promise.all([
    hotelIds.length === 0
      ? Promise.resolve({ data: [] as HotelBookingDisplayRow[], error: null })
      : supabase
          .from('hotels')
          .select('id, name, slug')
          .eq('agency_id', agencyId)
          .in('id', hotelIds),
    roomTypeIds.length === 0
      ? Promise.resolve({ data: [] as RoomTypeDisplayRow[], error: null })
      : supabase.from('room_types').select('id, hotel_id, name, slug').in('id', roomTypeIds),
  ]);

  if (hotelsRes.error) throw hotelsRes.error;
  if (roomTypesRes.error) throw roomTypesRes.error;

  return {
    hotelsById: new Map((hotelsRes.data ?? []).map((hotel) => [hotel.id, hotel])),
    roomTypesById: new Map((roomTypesRes.data ?? []).map((roomType) => [roomType.id, roomType])),
  };
}

function mapAdminHotelBooking(
  row: HotelBookingRow,
  lookups: BookingDisplayLookups
): AdminHotelBooking {
  const booking = toCamelCase(row) as HotelBooking;
  const hotel = lookups.hotelsById.get(row.hotel_id) ?? null;
  const roomType = lookups.roomTypesById.get(row.room_type_id) ?? null;
  const scopedRoomType = hotel && roomType?.hotel_id === row.hotel_id ? roomType : null;

  return {
    ...booking,
    hotelName: hotel?.name ?? null,
    hotelSlug: hotel?.slug ?? null,
    roomTypeName: scopedRoomType?.name ?? null,
    roomTypeSlug: scopedRoomType?.slug ?? null,
  };
}

async function mapAdminHotelBookingRows(
  supabase: SupabaseClient,
  agencyId: string,
  rows: HotelBookingRow[]
): Promise<AdminHotelBooking[]> {
  const lookups = await loadBookingDisplayLookups(supabase, agencyId, rows);
  return rows.map((row) => mapAdminHotelBooking(row, lookups));
}

async function assertHotelBookingInventoryScope(
  supabase: SupabaseClient,
  agencyId: string,
  row: HotelBookingStatusRow
): Promise<void> {
  const [hotelRes, roomTypeRes] = await Promise.all([
    supabase
      .from('hotels')
      .select('id')
      .eq('id', row.hotel_id)
      .eq('agency_id', agencyId)
      .maybeSingle(),
    supabase
      .from('room_types')
      .select('id')
      .eq('id', row.room_type_id)
      .eq('hotel_id', row.hotel_id)
      .maybeSingle(),
  ]);

  if (hotelRes.error) throw hotelRes.error;
  if (roomTypeRes.error) throw roomTypeRes.error;
  if (!hotelRes.data || !roomTypeRes.data) {
    throw new Error('Hotel booking inventory scope is invalid.');
  }
}

async function getHotelBookingByIdWithClient(
  supabase: SupabaseClient,
  agencyId: string,
  id: string
): Promise<AdminHotelBooking | null> {
  if (!id.trim()) return null;

  const { data, error } = await supabase
    .from('hotel_bookings')
    .select(HOTEL_BOOKING_SELECT)
    .eq('agency_id', agencyId)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const bookings = await mapAdminHotelBookingRows(supabase, agencyId, [data as HotelBookingRow]);
  return bookings[0] ?? null;
}

function revalidateHotelBookingPaths(booking: AdminHotelBooking): void {
  revalidatePath('/admin/hotels');
  revalidatePath('/admin/hotels/bookings');
  revalidatePath('/admin/hotels/availability');
  revalidatePath('/');
  revalidatePath('/hotel');
  revalidatePath('/hotels');
  revalidatePath('/rooms/[slug]', 'page');
  revalidatePath('/hotels/[slug]', 'page');
  revalidatePath('/hotels/[slug]/rooms/[roomSlug]', 'page');

  if (booking.hotelSlug) {
    revalidatePath(`/hotels/${booking.hotelSlug}`);
  }
  if (booking.roomTypeSlug) {
    revalidatePath(`/rooms/${booking.roomTypeSlug}`);
  }
  if (booking.hotelSlug && booking.roomTypeSlug) {
    revalidatePath(`/hotels/${booking.hotelSlug}/rooms/${booking.roomTypeSlug}`);
  }
}

function getRoomBaseCurrency(): 'USD' {
  return 'USD';
}

async function uploadRoomImages(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  hotelId: string;
  roomSlug: string;
  files: File[];
}) {
  const imageUrls: string[] = [];

  for (const file of params.files) {
    if (!file?.name || !file.size) continue;
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const filePath = `public/hotels/${params.hotelId}/rooms/${params.roomSlug}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await params.supabase.storage
      .from('tours')
      .upload(filePath, file, {
        contentType: file.type || undefined,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = params.supabase.storage.from('tours').getPublicUrl(filePath);
    imageUrls.push(urlData.publicUrl);
  }

  return imageUrls;
}

export async function getHotels(options: SkipOpt = {}): Promise<Hotel[]> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const hotels = (data || []).map((row) => toCamelCase(row) as Hotel);
  return maybeTranslateHotels(hotels, options.skipTranslation);
}

export async function getPublicHotels(options: SkipOpt = {}): Promise<Hotel[]> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const hotels = (data || []).map((row) => toCamelCase(row) as Hotel);
  return maybeTranslateHotels(hotels, options.skipTranslation);
}

export async function getHotelLookupByIds(
  ids: string[]
): Promise<Array<{ id: string; name: string; slug: string }>> {
  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0)));
  if (unique.length === 0) return [];

  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('hotels')
    .select('id, name, slug')
    .eq('agency_id', agencyId)
    .in('id', unique);

  if (error) {
    throw error;
  }

  return (data || []) as Array<{ id: string; name: string; slug: string }>;
}

/**
 * Resolve hotel summaries plus the single-hotel-mode flag for cart/checkout
 * room rendering. Single combined call so client pages don't have to chain
 * two server actions.
 */
export async function getCartRoomLookup(hotelIds: string[]): Promise<{
  hotels: Array<{ id: string; name: string; slug: string }>;
  singleHotelMode: boolean;
}> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const unique = Array.from(
    new Set(hotelIds.filter((id) => typeof id === 'string' && id.length > 0))
  );

  const [hotelsRes, settingsRes] = await Promise.all([
    unique.length === 0
      ? Promise.resolve({
          data: [] as Array<{ id: string; name: string; slug: string }>,
          error: null,
        })
      : supabase.from('hotels').select('id, name, slug').eq('agency_id', agencyId).in('id', unique),
    supabase.from('settings').select('data').eq('agency_id', agencyId).maybeSingle(),
  ]);

  if (hotelsRes.error) throw hotelsRes.error;

  const data = (settingsRes.data?.data ?? null) as { singleHotelMode?: boolean } | null;
  const singleHotelMode = data?.singleHotelMode === true;

  return {
    hotels: (hotelsRes.data || []) as Array<{ id: string; name: string; slug: string }>,
    singleHotelMode,
  };
}

export async function getHotelBySlug(slug: string, options: SkipOpt = {}): Promise<Hotel | null> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;
  return maybeTranslateHotel(toCamelCase(data) as Hotel, options.skipTranslation);
}

export async function getPublicHotelBySlug(
  slug: string,
  options: SkipOpt = {}
): Promise<Hotel | null> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;
  return maybeTranslateHotel(toCamelCase(data) as Hotel, options.skipTranslation);
}

export async function getRoomTypesByHotelId(
  hotelId: string,
  options: SkipOpt = {}
): Promise<RoomType[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('room_types')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const rooms = (data || []).map((row) => toCamelCase(row) as RoomType);
  return maybeTranslateRoomTypes(rooms, options.skipTranslation);
}

export async function getPublicRoomTypesByHotelId(
  hotelId: string,
  options: SkipOpt = {}
): Promise<RoomType[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('room_types')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const rooms = (data || []).map((row) => toCamelCase(row) as RoomType);
  return maybeTranslateRoomTypes(rooms, options.skipTranslation);
}

export async function getRoomTypeBySlug(params: {
  hotelId: string;
  roomSlug: string;
  skipTranslation?: boolean;
}): Promise<RoomType | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('room_types')
    .select('*')
    .eq('hotel_id', params.hotelId)
    .eq('slug', params.roomSlug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;
  return maybeTranslateRoomType(toCamelCase(data) as RoomType, params.skipTranslation);
}

export async function getRoomInventory(params: {
  roomTypeId: string;
  from: string;
  to: string;
}): Promise<RoomInventory[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('room_inventory')
    .select('*')
    .eq('room_type_id', params.roomTypeId)
    .gte('date', params.from)
    .lt('date', params.to)
    .order('date', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => toCamelCase(row) as RoomInventory);
}

export async function getHotelBookings(): Promise<AdminHotelBooking[]> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('hotel_bookings')
    .select(HOTEL_BOOKING_SELECT)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return mapAdminHotelBookingRows(
    supabase as SupabaseClient,
    agencyId,
    (data || []) as HotelBookingRow[]
  );
}

export async function getHotelBookingById(id: string): Promise<AdminHotelBooking | null> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();
  return getHotelBookingByIdWithClient(supabase as SupabaseClient, agencyId, id);
}

export async function getHotelDashboardOperationsSummary(): Promise<HotelDashboardOperationsSummary> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('hotel_bookings')
    .select('status, check_in, total')
    .eq('agency_id', agencyId);

  if (error) {
    throw error;
  }

  const today = new Date().toISOString().slice(0, 10);
  const summary: HotelDashboardOperationsSummary = {
    totalBookings: 0,
    activeBookings: 0,
    pendingBookings: 0,
    confirmedBookings: 0,
    paidBookings: 0,
    cancelledBookings: 0,
    upcomingCheckIns: 0,
    revenueTotal: 0,
  };

  for (const row of (data ?? []) as HotelBookingSummaryRow[]) {
    summary.totalBookings += 1;

    if (!row.status || !isHotelBookingStatus(row.status)) continue;

    if (row.status === 'pending') summary.pendingBookings += 1;
    if (row.status === 'confirmed') summary.confirmedBookings += 1;
    if (row.status === 'paid') summary.paidBookings += 1;
    if (row.status === 'cancelled') summary.cancelledBookings += 1;

    if (row.status !== 'cancelled') {
      summary.activeBookings += 1;
      summary.revenueTotal += Number(row.total ?? 0);

      if (row.check_in && row.check_in >= today) {
        summary.upcomingCheckIns += 1;
      }
    }
  }

  return summary;
}

export async function updateHotelBookingStatus(
  bookingId: string,
  status: HotelBookingStatus
): Promise<AdminHotelBooking> {
  const nextStatus = normalizeHotelBookingStatus(status);
  const id = bookingId.trim();
  if (!id) throw new Error('Hotel booking id is required.');

  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const { data: current, error: currentError } = await supabase
    .from('hotel_bookings')
    .select(HOTEL_BOOKING_STATUS_SELECT)
    .eq('id', id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (currentError) throw currentError;
  if (!current) throw new Error('Hotel booking not found.');

  const currentRow = current as HotelBookingStatusRow;
  const previousStatus = normalizeHotelBookingStatus(currentRow.status);

  if (previousStatus === nextStatus) {
    const unchanged = await getHotelBookingByIdWithClient(supabase, agencyId, id);
    if (!unchanged) throw new Error('Hotel booking not found.');
    revalidateHotelBookingPaths(unchanged);
    return unchanged;
  }

  const wasActive = isActiveHotelBookingStatus(previousStatus);
  const willBeActive = isActiveHotelBookingStatus(nextStatus);
  const inventoryArgs = getHotelBookingInventoryArgs(currentRow);

  if (wasActive !== willBeActive) {
    await assertHotelBookingInventoryScope(supabase, agencyId, currentRow);
  }

  const { data: updated, error: updateError } = await supabase
    .from('hotel_bookings')
    .update({ status: nextStatus })
    .eq('id', currentRow.id)
    .eq('agency_id', agencyId)
    .eq('status', previousStatus)
    .select(HOTEL_BOOKING_STATUS_SELECT)
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) {
    throw new Error('Hotel booking status changed before this update could be applied.');
  }

  try {
    if (wasActive && !willBeActive) {
      await callRoomInventoryRpc(
        supabase,
        'release_room_inventory',
        inventoryArgs,
        `Failed to release room inventory for hotel booking ${id}`
      );
    } else if (!wasActive && willBeActive) {
      await callRoomInventoryRpc(
        supabase,
        'reserve_room_inventory',
        inventoryArgs,
        `Failed to reserve room inventory for hotel booking ${id}`
      );
    }
  } catch (error) {
    const { error: rollbackError } = await supabase
      .from('hotel_bookings')
      .update({ status: previousStatus })
      .eq('id', currentRow.id)
      .eq('agency_id', agencyId)
      .eq('status', nextStatus);

    const rollbackMessage = rollbackError
      ? ` Status rollback failed: ${getErrorMessage(rollbackError)}`
      : '';
    throw new Error(`${getErrorMessage(error)}${rollbackMessage}`);
  }

  const booking = await getHotelBookingByIdWithClient(supabase, agencyId, id);
  if (!booking) throw new Error('Hotel booking not found after status update.');

  revalidateHotelBookingPaths(booking);
  return booking;
}

export async function addRoomType(input: {
  hotelId: string;
  name: string;
  slug?: string;
  description?: string;
  maxAdults: number;
  maxChildren: number;
  sizeSqm?: number | null;
  view?: string | null;
  bathrooms?: number | null;
  floor?: number | null;
  basePricePerNight?: number | null;
  currency?: string | null;
  defaultUnits?: number | null;
  smokingAllowed?: boolean;
  refundable?: boolean;
  breakfastIncluded?: boolean;
  petsAllowed?: boolean;
  extraBedAllowed?: boolean;
  extraBedFee?: number | null;
  cancellationPolicy?: string | null;
  beds?: Record<string, unknown>;
  amenities?: string[];
  services?: string[];
  highlights?: string[];
  accessibility?: Record<string, unknown>;
  images?: Array<File | string>;
  isFeatured?: boolean;
  isActive: boolean;
}) {
  const supabase = await createAdminClient();
  const slugBase = slugify(input.slug?.trim() || input.name);
  const base = slugBase || `room-${crypto.randomUUID().slice(0, 8)}`;

  const fileUploads = (input.images || []).filter(
    (img): img is File => typeof img === 'object' && 'name' in img && 'size' in img
  );
  const existingUrls = (input.images || []).filter((img): img is string => typeof img === 'string');

  const attemptInsert = async (slug: string) => {
    const uploadedUrls = await uploadRoomImages({
      supabase,
      hotelId: input.hotelId,
      roomSlug: slug,
      files: fileUploads,
    });

    return supabase.from('room_types').insert({
      hotel_id: input.hotelId,
      name: input.name,
      slug,
      description: input.description?.trim() || null,
      max_adults: input.maxAdults,
      max_children: input.maxChildren,
      beds: input.beds ?? {},
      amenities: input.amenities ?? [],
      services: input.services ?? [],
      highlights: input.highlights ?? [],
      size_sqm: input.sizeSqm ?? null,
      view: input.view?.trim() || null,
      bathrooms: input.bathrooms ?? null,
      floor: input.floor ?? null,
      base_price_per_night: input.basePricePerNight ?? null,
      currency: getRoomBaseCurrency(),
      default_units: normalizeRoomUnitCapacity(input.defaultUnits),
      smoking_allowed: input.smokingAllowed ?? false,
      refundable: input.refundable ?? true,
      breakfast_included: input.breakfastIncluded ?? false,
      pets_allowed: input.petsAllowed ?? false,
      extra_bed_allowed: input.extraBedAllowed ?? false,
      extra_bed_fee: input.extraBedFee ?? null,
      cancellation_policy: input.cancellationPolicy?.trim() || null,
      accessibility: input.accessibility ?? {},
      images: [...existingUrls, ...uploadedUrls],
      is_featured: input.isFeatured ?? false,
      is_active: input.isActive,
    });
  };

  let result = await attemptInsert(base);
  if (result.error && result.error.code === '23505') {
    result = await attemptInsert(`${base}-${crypto.randomUUID().slice(0, 4)}`);
  }

  if (result.error) {
    throw result.error;
  }

  revalidatePath('/admin/hotels/rooms');
  revalidatePath('/hotels');
  redirect('/admin/hotels/rooms');
}

export async function getRoomTypeById(id: string): Promise<RoomType | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.from('room_types').select('*').eq('id', id).maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;
  return toCamelCase(data) as RoomType;
}

export async function updateRoomType(input: {
  id: string;
  hotelId: string;
  name: string;
  slug: string;
  description?: string;
  maxAdults: number;
  maxChildren: number;
  sizeSqm?: number | null;
  view?: string | null;
  bathrooms?: number | null;
  floor?: number | null;
  basePricePerNight?: number | null;
  currency?: string | null;
  defaultUnits?: number | null;
  smokingAllowed?: boolean;
  refundable?: boolean;
  breakfastIncluded?: boolean;
  petsAllowed?: boolean;
  extraBedAllowed?: boolean;
  extraBedFee?: number | null;
  cancellationPolicy?: string | null;
  beds?: Record<string, unknown>;
  amenities?: string[];
  services?: string[];
  highlights?: string[];
  accessibility?: Record<string, unknown>;
  images?: Array<File | string>;
  isFeatured?: boolean;
  isActive: boolean;
}) {
  const supabase = await createAdminClient();
  const slugBase = slugify(input.slug?.trim() || input.name);
  const slug = slugBase || `room-${crypto.randomUUID().slice(0, 8)}`;

  const fileUploads = (input.images || []).filter(
    (img): img is File => typeof img === 'object' && 'name' in img && 'size' in img
  );
  const existingUrls = (input.images || []).filter((img): img is string => typeof img === 'string');

  const uploadedUrls = await uploadRoomImages({
    supabase,
    hotelId: input.hotelId,
    roomSlug: slug,
    files: fileUploads,
  });

  const updateObj = {
    name: input.name,
    slug,
    description: input.description?.trim() || null,
    max_adults: input.maxAdults,
    max_children: input.maxChildren,
    beds: input.beds ?? {},
    amenities: input.amenities ?? [],
    services: input.services ?? [],
    highlights: input.highlights ?? [],
    size_sqm: input.sizeSqm ?? null,
    view: input.view?.trim() || null,
    bathrooms: input.bathrooms ?? null,
    floor: input.floor ?? null,
    base_price_per_night: input.basePricePerNight ?? null,
    currency: getRoomBaseCurrency(),
    default_units: normalizeRoomUnitCapacity(input.defaultUnits),
    smoking_allowed: input.smokingAllowed ?? false,
    refundable: input.refundable ?? true,
    breakfast_included: input.breakfastIncluded ?? false,
    pets_allowed: input.petsAllowed ?? false,
    extra_bed_allowed: input.extraBedAllowed ?? false,
    extra_bed_fee: input.extraBedFee ?? null,
    cancellation_policy: input.cancellationPolicy?.trim() || null,
    // Only overwrite accessibility when explicitly provided; otherwise preserve the existing DB value.
    ...(input.accessibility !== undefined && { accessibility: input.accessibility }),
    images: [...existingUrls, ...uploadedUrls],
    is_featured: input.isFeatured ?? false,
    is_active: input.isActive,
  };

  const { error } = await supabase
    .from('room_types')
    .update(updateObj)
    .eq('id', input.id)
    .eq('hotel_id', input.hotelId);

  if (error) {
    throw error;
  }

  revalidatePath('/admin/hotels/rooms');
  revalidatePath('/admin/hotels/availability');
  revalidatePath('/hotels');
  redirect('/admin/hotels/rooms');
}

export async function createHotelProfile(input: {
  name: string;
  slug?: string;
  description?: string;
  city?: string;
  country?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  timezone?: string;
  starRating?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  checkInTime?: string;
  checkOutTime?: string;
  isActive: boolean;
}) {
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const { data: existing, error: existingError } = await supabase
    .from('hotels')
    .select('id')
    .eq('agency_id', agencyId)
    .limit(1);

  if (existingError) {
    throw existingError;
  }

  if (existing && existing.length > 0) {
    redirect('/admin/hotels');
  }

  const slugBase = slugify(input.slug?.trim() || input.name);
  const base = slugBase || `hotel-${crypto.randomUUID().slice(0, 8)}`;

  const attemptInsert = async (slug: string) => {
    return supabase.from('hotels').insert({
      agency_id: agencyId,
      slug,
      name: input.name,
      description: input.description?.trim() || null,
      city: input.city?.trim() || null,
      country: input.country?.trim() || null,
      address: input.address?.trim() || null,
      contact_email: input.contactEmail?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      website: input.website?.trim() || null,
      timezone: input.timezone?.trim() || null,
      star_rating: input.starRating ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      check_in_time: input.checkInTime?.trim() || null,
      check_out_time: input.checkOutTime?.trim() || null,
      policies: {},
      images: [],
      is_active: input.isActive,
    });
  };

  let result = await attemptInsert(base);
  if (result.error && result.error.code === '23505') {
    result = await attemptInsert(`${base}-${crypto.randomUUID().slice(0, 4)}`);
  }

  if (result.error) {
    throw result.error;
  }

  revalidatePath('/admin/hotels');
  revalidatePath('/admin/hotels/rooms');
  revalidatePath('/admin/hotels/availability');
  redirect('/admin/hotels');
}

export async function updateHotelProfile(input: {
  id: string;
  name: string;
  slug: string;
  description?: string;
  city?: string;
  country?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  timezone?: string;
  starRating?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  checkInTime?: string;
  checkOutTime?: string;
  isActive: boolean;
}) {
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const slugBase = slugify(input.slug?.trim() || input.name);
  const slug = slugBase || `hotel-${crypto.randomUUID().slice(0, 8)}`;

  const { error } = await supabase
    .from('hotels')
    .update({
      slug,
      name: input.name,
      description: input.description?.trim() || null,
      city: input.city?.trim() || null,
      country: input.country?.trim() || null,
      address: input.address?.trim() || null,
      contact_email: input.contactEmail?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      website: input.website?.trim() || null,
      timezone: input.timezone?.trim() || null,
      star_rating: input.starRating ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      check_in_time: input.checkInTime?.trim() || null,
      check_out_time: input.checkOutTime?.trim() || null,
      is_active: input.isActive,
    })
    .eq('id', input.id)
    .eq('agency_id', agencyId);

  if (error) {
    throw error;
  }

  revalidatePath('/admin/hotels');
  revalidatePath('/admin/hotels/rooms');
  revalidatePath('/admin/hotels/availability');
  revalidatePath('/hotels');
  redirect('/admin/hotels');
}

export async function upsertRoomInventoryRange(input: {
  roomTypeId: string;
  from: string;
  to: string;
  availableUnits: number;
  pricePerNight: number;
  stopSell: boolean;
  redirectFrom?: string;
  redirectTo?: string;
  redirectSearchParams?: Record<string, string | number | undefined>;
}) {
  const supabase = await createAdminClient();

  const fromDate = new Date(`${input.from}T00:00:00Z`);
  const toDate = new Date(`${input.to}T00:00:00Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('Invalid date range.');
  }
  if (toDate < fromDate) {
    throw new Error('End date must be after start date.');
  }

  const rows: Array<Record<string, unknown>> = [];
  for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    rows.push({
      room_type_id: input.roomTypeId,
      date: dateStr,
      available_units: input.availableUnits,
      price_per_night: input.pricePerNight,
      stop_sell: input.stopSell,
    });
  }

  const { error } = await supabase
    .from('room_inventory')
    .upsert(rows, { onConflict: 'room_type_id,date' });

  if (error) {
    throw error;
  }

  revalidatePath('/admin/hotels/availability');
  revalidatePath('/rooms/[slug]', 'page');
  revalidatePath('/hotels/[slug]/rooms/[roomSlug]', 'page');
  const query = new URLSearchParams({
    roomTypeId: input.roomTypeId,
    from: input.redirectFrom ?? input.from,
    to: input.redirectTo ?? input.to,
  });

  for (const [key, value] of Object.entries(input.redirectSearchParams ?? {})) {
    if (value == null) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    query.set(key, normalized);
  }

  redirect(`/admin/hotels/availability?${query.toString()}`);
}
