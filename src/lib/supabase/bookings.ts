'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/agency-users';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Booking,
  CartItem,
  Tour,
  UpsellItem,
  PriceTier,
  RoomCartAddon,
  RoomCartItem,
} from '@/types';
import { revalidatePath } from 'next/cache';
import { toCamelCase } from '@/lib/utils';
import { getCurrentAgencyId } from '@/lib/supabase/agencies';
import { validatePromoCode } from '@/lib/supabase/promo-codes';
import {
  checkTourDateAvailability,
  decrementAvailableSpots,
} from '@/lib/supabase/tour-availability';
import { sendEmail } from '@/lib/email';
import { renderBookingConfirmationEmail } from '@/lib/email/templates/booking-confirmation';
import { renderBookingNotificationEmail } from '@/lib/email/templates/booking-notification';
import { renderBookingStatusChangeEmail } from '@/lib/email/templates/booking-status-change';
import { renderBookingPaymentConfirmedEmail } from '@/lib/email/templates/booking-payment-confirmed';
import {
  getAgencySettings,
  getCheckoutPaymentMethodAvailability,
  type AgencySettingsData,
} from '@/lib/supabase/agency-content';
import { getRoomAddons, getRoomPriceQuote } from '@/lib/supabase/room-pricing';

type NonRoomCartItem = Exclude<CartItem, RoomCartItem>;
type PaymentFinalStatus = Extract<Booking['status'], 'Confirmed' | 'Cancelled'>;
type VerifiedPaymentStatusChangeResult = {
  status: Booking['status'] | 'unknown';
  changed: boolean;
  reason?:
    | 'booking_not_found'
    | 'not_online_payment'
    | 'already_confirmed'
    | 'not_pending'
    | 'concurrent_status_change';
};
type BookingStatusEmailSettings = {
  data?: AgencySettingsData | null;
  logo_url?: string | null;
};
type BookingStatusEmailContext = {
  bookingId: string;
  status: PaymentFinalStatus;
  previousStatus: Booking['status'];
  paymentMethod?: 'cash' | 'online';
  supabase: SupabaseClient;
  loadSettings: () => Promise<BookingStatusEmailSettings | null>;
};

type BookingStatusSnapshot = {
  id: string;
  status: Booking['status'];
  payment_method: 'cash' | 'online' | null;
  agency_id: string;
  customer_email: string | null;
};

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roomAddonsTotal(room: RoomCartItem): number {
  return roundCurrency(
    room.addons.reduce((total, addon) => total + addon.unitPrice * addon.quantity, 0)
  );
}

async function priceRoomCartAddons(item: RoomCartItem): Promise<RoomCartAddon[]> {
  const requested = new Map(
    item.addons
      .map((addon) => [addon.id, Math.trunc(Number(addon.quantity))] as const)
      .filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0)
  );

  if (requested.size === 0) return [];

  const activeAddons = await getRoomAddons(item.roomTypeId).catch(() => []);
  return activeAddons.flatMap((addon) => {
    const quantity = requested.get(addon.id) ?? 0;
    if (quantity < 1) return [];

    return [
      {
        id: addon.id,
        name: addon.name,
        unitPrice: Number(addon.price),
        quantity,
        currency: 'USD',
      },
    ];
  });
}

async function quoteRoomCartItem(item: RoomCartItem): Promise<RoomCartItem> {
  const quote = await getRoomPriceQuote({
    roomTypeId: item.roomTypeId,
    checkIn: item.checkInDate,
    checkOut: item.checkOutDate,
    adults: item.adults,
    children: item.children,
    units: item.unitsBooked,
    excludeSessionId: item.holdSessionId,
    excludeLineId: item.lineId,
  });

  if (!quote.isAvailable) {
    const unavailable = quote.unavailableDates[0];
    const minNights = quote.minNightsViolations.reduce(
      (highest, violation) => Math.max(highest, violation.minNights),
      0
    );
    const reason =
      minNights > 0
        ? `requires at least ${minNights} night${minNights === 1 ? '' : 's'}`
        : unavailable
          ? `is not available on ${unavailable}`
          : 'is not available for the selected dates';

    throw new Error(`Room "${item.name}" ${reason}.`);
  }

  const addons = await priceRoomCartAddons(item);
  const addonsTotal = roundCurrency(
    addons.reduce((total, addon) => total + addon.unitPrice * addon.quantity, 0)
  );
  const tier = quote.tier
    ? {
        id: quote.tier.id,
        minNights: quote.tier.minNights,
        discountPercent: quote.tier.discountPercent,
        amount: quote.tierDiscountAmount,
      }
    : undefined;

  return {
    ...item,
    product: item.product ?? { id: quote.roomTypeId, name: quote.name },
    roomTypeId: quote.roomTypeId,
    hotelId: quote.hotelId,
    roomSlug: quote.roomSlug,
    name: quote.name,
    checkInDate: quote.checkIn,
    checkOutDate: quote.checkOut,
    nights: quote.nights,
    adults: quote.adults,
    children: quote.children,
    unitsBooked: quote.units,
    currency: quote.currency,
    basePricePerNight: quote.basePricePerNight,
    pricePerNightAvg: quote.pricePerNightAvg,
    subtotal: roundCurrency(quote.subtotal + addonsTotal),
    subtotalBeforeTier: quote.subtotalBeforeTier,
    tier,
    addons,
  };
}

export async function getPendingBookingsCount(): Promise<number> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { count, error } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .eq('status', 'Pending');

  if (error) return 0;
  return count ?? 0;
}

export async function getBookings(): Promise<Booking[]> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('bookings')
    .select('*, booking_items(*, tours(name, slug), upsell_items(name, price))')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching bookings:', error);
    return [];
  }
  return data.map(toCamelCase) as Booking[];
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  const { data, error } = await supabase
    .from('bookings')
    .select('*, booking_items(*, tours(name, slug, packages), upsell_items(name, price))')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single();

  if (error) {
    console.error(`Error fetching booking by ID ${id}:`, error);
    return null;
  }
  if (!data) return null;

  return toCamelCase(data) as Booking;
}

export async function updateBookingStatus(bookingId: string, status: Booking['status']) {
  await applyBookingStatusChange(bookingId, status, { scopeToCurrentAgency: true });
  revalidatePath('/admin/bookings');
  revalidatePath(`/admin/bookings/${bookingId}`);
}

/**
 * Service-role status transition for already verified payment-provider events.
 * Callers must verify the provider signature before invoking this function.
 */
export async function applyVerifiedPaymentStatusChange(
  bookingId: string,
  status: PaymentFinalStatus
): Promise<VerifiedPaymentStatusChangeResult> {
  const supabase = createServiceRoleClient();
  const previous = await getBookingStatusSnapshot(supabase, bookingId);

  if (!previous) {
    return { status: 'unknown', changed: false, reason: 'booking_not_found' };
  }

  if (previous.payment_method !== 'online') {
    return { status: previous.status, changed: false, reason: 'not_online_payment' };
  }

  if (previous.status === status) {
    return { status: previous.status, changed: false };
  }

  if (previous.status === 'Confirmed') {
    return { status: previous.status, changed: false, reason: 'already_confirmed' };
  }

  if (previous.status !== 'Pending') {
    return { status: previous.status, changed: false, reason: 'not_pending' };
  }

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId)
    .eq('status', 'Pending')
    .eq('payment_method', 'online')
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error updating verified payment booking status:', error);
    throw new Error('Failed to update booking status.');
  }

  if (!updated) {
    const latest = await getBookingStatusSnapshot(supabase, bookingId);
    if (!latest) return { status: 'unknown', changed: false, reason: 'booking_not_found' };
    if (latest.status === status) return { status: latest.status, changed: false };
    if (latest.status === 'Confirmed') {
      return { status: latest.status, changed: false, reason: 'already_confirmed' };
    }
    return { status: latest.status, changed: false, reason: 'concurrent_status_change' };
  }

  await sendBookingStatusChangeEmail({
    bookingId,
    status,
    previousStatus: previous.status,
    paymentMethod: previous.payment_method ?? undefined,
    supabase,
    loadSettings: () => getAgencySettingsForEmailByAgencyId(supabase, previous.agency_id),
  });

  return { status, changed: true };
}

/**
 * Core status-change applier used by the admin UI (`updateBookingStatus`).
 * Handles:
 * - the DB update (authenticated admin client, optional agency scope)
 * - selecting the right customer email template based on previous status
 *   and payment method (online Pending → Confirmed gets a dedicated
 *   "Payment Received" email; everything else gets the generic status-change)
 * Non-blocking: email failures do not fail the status update.
 */
export async function applyBookingStatusChange(
  bookingId: string,
  status: Booking['status'],
  opts: { scopeToCurrentAgency?: boolean } = {}
): Promise<void> {
  const supabase = await createAdminClient();

  // Read previous state first (we need previous status + payment_method
  // to pick the right email).
  const baseQuery = supabase
    .from('bookings')
    .select('id, status, payment_method, agency_id, customer_email')
    .eq('id', bookingId);

  const previousQuery = opts.scopeToCurrentAgency
    ? baseQuery.eq('agency_id', await getCurrentAgencyId())
    : baseQuery;

  const { data: previous, error: previousErr } = await previousQuery.maybeSingle();

  if (previousErr || !previous) {
    if (previousErr) console.error('Error reading booking for status change:', previousErr);
    throw new Error('Booking not found for status change.');
  }

  const previousStatus = previous.status as Booking['status'];
  const paymentMethod = (previous.payment_method as 'cash' | 'online' | null) ?? undefined;

  if (previousStatus === status) return; // idempotent

  const updateBase = supabase.from('bookings').update({ status }).eq('id', bookingId);
  const { error } = opts.scopeToCurrentAgency
    ? await updateBase.eq('agency_id', previous.agency_id)
    : await updateBase;

  if (error) {
    console.error('Error updating booking status:', error);
    throw new Error('Failed to update booking status.');
  }

  if (status !== 'Confirmed' && status !== 'Cancelled') return;

  await sendBookingStatusChangeEmail({
    bookingId,
    status,
    previousStatus,
    paymentMethod,
    supabase,
    loadSettings: () => getAgencySettings().catch(() => null),
  });
}

async function getBookingStatusSnapshot(
  supabase: SupabaseClient,
  bookingId: string
): Promise<BookingStatusSnapshot | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, payment_method, agency_id, customer_email')
    .eq('id', bookingId)
    .maybeSingle();

  if (error) {
    console.error('Error reading booking for status change:', error);
    throw new Error('Booking not found for status change.');
  }

  return (data as BookingStatusSnapshot | null) ?? null;
}

async function getAgencySettingsForEmailByAgencyId(
  supabase: SupabaseClient,
  agencyId: string
): Promise<BookingStatusEmailSettings | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('data, logo_url')
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching email settings for agency ${agencyId}:`, error);
    return null;
  }

  if (!data) return null;

  const row = data as { data: AgencySettingsData | null; logo_url: string | null };
  return {
    data: row.data ?? {},
    logo_url: row.logo_url,
  };
}

async function sendBookingStatusChangeEmail(context: BookingStatusEmailContext): Promise<void> {
  try {
    const [booking, settings] = await Promise.all([
      getBookingByIdUnscoped(context.supabase, context.bookingId),
      context.loadSettings().catch(() => null),
    ]);

    if (!booking?.customerEmail) return;

    const agencyData = settings?.data;
    const agencyName = agencyData?.agencyName || 'Your Travel Agency';
    const items = (booking.bookingItems || []).map((bi) => ({
      name: bi.tours?.name ?? bi.upsellItems?.name ?? 'Item',
      packageName: bi.packageName,
      adults: bi.adults,
      children: bi.children,
      date: bi.itemDate,
      price: bi.price,
    }));

    const isOnlinePaymentSuccess =
      context.status === 'Confirmed' &&
      context.previousStatus === 'Pending' &&
      context.paymentMethod === 'online';

    if (isOnlinePaymentSuccess) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
      await sendEmail({
        agencyEmailSettings: agencyData?.emailSettings,
        to: booking.customerEmail,
        subject: `✅ Payment Received — Booking #${context.bookingId.substring(0, 8).toUpperCase()}`,
        html: renderBookingPaymentConfirmedEmail({
          agencyName,
          agencyLogoUrl: settings?.logo_url || undefined,
          agencyEmail: agencyData?.contactEmail,
          agencyPhone: agencyData?.phoneNumber,
          bookingId: context.bookingId,
          customerName: booking.customerName,
          paymentMethod: 'online',
          totalPrice: booking.totalPrice,
          items,
          voucherUrl: appUrl ? `${appUrl}/api/bookings/${context.bookingId}/voucher` : undefined,
        }),
      });
      return;
    }

    await sendEmail({
      agencyEmailSettings: agencyData?.emailSettings,
      to: booking.customerEmail,
      subject: `Booking ${context.status} — ${agencyName}`,
      html: renderBookingStatusChangeEmail({
        agencyName,
        agencyLogoUrl: settings?.logo_url || undefined,
        agencyEmail: agencyData?.contactEmail,
        agencyPhone: agencyData?.phoneNumber,
        bookingId: context.bookingId,
        customerName: booking.customerName,
        newStatus: context.status,
        totalPrice: booking.totalPrice,
        items,
      }),
    });
  } catch (emailErr) {
    console.error('Error sending status change email:', emailErr);
  }
}

/**
 * Re-send the appropriate customer confirmation email for a booking without
 * changing its status. Useful for an admin "Resend confirmation" action.
 */
export async function resendBookingConfirmationEmail(bookingId: string): Promise<void> {
  const booking = await getBookingById(bookingId);
  if (!booking?.customerEmail) {
    throw new Error('Booking has no customer email.');
  }

  const settings = await getAgencySettings().catch(() => null);
  const agencyData = settings?.data;
  const agencyName = agencyData?.agencyName || 'Your Travel Agency';
  const items = (booking.bookingItems || []).map((bi) => ({
    name: bi.tours?.name ?? bi.upsellItems?.name ?? 'Item',
    packageName: bi.packageName,
    adults: bi.adults,
    children: bi.children,
    date: bi.itemDate,
    price: bi.price,
  }));

  if (booking.status === 'Confirmed') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
    await sendEmail({
      agencyEmailSettings: agencyData?.emailSettings,
      to: booking.customerEmail,
      subject: `✅ Booking Confirmed — #${bookingId.substring(0, 8).toUpperCase()}`,
      html: renderBookingPaymentConfirmedEmail({
        agencyName,
        agencyLogoUrl: settings?.logo_url || undefined,
        agencyEmail: agencyData?.contactEmail,
        agencyPhone: agencyData?.phoneNumber,
        bookingId,
        customerName: booking.customerName,
        paymentMethod: booking.paymentMethod ?? 'cash',
        totalPrice: booking.totalPrice,
        items,
        voucherUrl: appUrl ? `${appUrl}/api/bookings/${bookingId}/voucher` : undefined,
      }),
    });
    return;
  }

  if (booking.status !== 'Cancelled') {
    throw new Error(`Cannot resend confirmation email for status "${booking.status}".`);
  }

  await sendEmail({
    agencyEmailSettings: agencyData?.emailSettings,
    to: booking.customerEmail,
    subject: `Booking ${booking.status} — ${agencyName}`,
    html: renderBookingStatusChangeEmail({
      agencyName,
      agencyLogoUrl: settings?.logo_url || undefined,
      agencyEmail: agencyData?.contactEmail,
      agencyPhone: agencyData?.phoneNumber,
      bookingId,
      customerName: booking.customerName,
      newStatus: booking.status,
      totalPrice: booking.totalPrice,
      items,
    }),
  });
}

/** Fetch a booking by id with an already-authorized service-role client. */
async function getBookingByIdUnscoped(
  supabase: SupabaseClient,
  id: string
): Promise<Booking | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, booking_items(*, tours(name, slug, packages), upsell_items(name, price))')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching booking by ID ${id}:`, error);
    return null;
  }
  if (!data) return null;
  return toCamelCase(data) as Booking;
}

export async function deleteBooking(bookingId: string) {
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId)
    .eq('agency_id', agencyId);

  if (error) {
    console.error('Error deleting booking:', error);
    throw new Error('Failed to delete booking.');
  }

  revalidatePath('/admin/bookings');
}

interface CreateBookingData {
  bookingId?: string;
  customerName: string;
  customerEmail: string;
  phoneNumber: string;
  nationality: string;
  cartItems: CartItem[];
  paymentMethod: 'cash' | 'online';
  promoCode?: string;
}

async function deleteNewBookingAfterPersistenceFailure(params: {
  bookingId: string;
  agencyId: string;
}): Promise<void> {
  const adminClient = await createAdminClient();

  const { error: deleteItemsError } = await adminClient
    .from('booking_items')
    .delete()
    .eq('booking_id', params.bookingId);

  if (deleteItemsError) {
    throw new Error(`Failed to clean up booking items: ${getErrorMessage(deleteItemsError)}`);
  }

  const { error: deleteBookingError } = await adminClient
    .from('bookings')
    .delete()
    .eq('id', params.bookingId)
    .eq('agency_id', params.agencyId);

  if (deleteBookingError) {
    throw new Error(`Failed to clean up booking: ${getErrorMessage(deleteBookingError)}`);
  }
}

export async function createBooking(data: CreateBookingData) {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();

  // 1. Calculate prices and prepare booking items
  const rawRoomCartItems: RoomCartItem[] = [];
  const nonRoomCartItems: NonRoomCartItem[] = [];

  for (const item of data.cartItems) {
    if (item.productType === 'room') {
      rawRoomCartItems.push(item);
    } else {
      nonRoomCartItems.push(item);
    }
  }

  const roomCartItems = await Promise.all(rawRoomCartItems.map(quoteRoomCartItem));
  const roomItemsByLineId = new Map(roomCartItems.map((item) => [item.lineId, item]));
  const pricedCartItems: CartItem[] = data.cartItems.map((item) => {
    if (item.productType !== 'room') return item;
    return roomItemsByLineId.get(item.lineId) ?? item;
  });

  let subtotal = roomCartItems.reduce((total, item) => total + item.subtotal, 0);
  const bookingItemsToInsert = nonRoomCartItems.map((item) => {
    let itemPrice = 0;
    let tourId: string | undefined;
    let upsellItemId: string | undefined;

    if (item.productType === 'tour') {
      const tour = item.product as Tour;
      tourId = tour.id;
      const totalPeople = (item.adults ?? 0) + (item.children ?? 0);

      let priceTiers = tour.priceTiers;

      if (item.packageId && tour.packages) {
        const selectedPackage = tour.packages.find((p) => p.id === item.packageId);
        if (selectedPackage) {
          priceTiers = selectedPackage.priceTiers;
        }
      }

      priceTiers = priceTiers || [];

      const priceTier =
        priceTiers.find(
          (tier: PriceTier) =>
            totalPeople >= tier.minPeople &&
            (tier.maxPeople === null || totalPeople <= tier.maxPeople)
        ) || priceTiers[priceTiers.length - 1];

      if (priceTier) {
        itemPrice =
          (item.adults ?? 0) * priceTier.pricePerAdult +
          (item.children ?? 0) * priceTier.pricePerChild;
      }
    } else if (item.productType === 'upsell') {
      const upsellItem = item.product as UpsellItem;
      upsellItemId = upsellItem.id;
      const variant =
        item.packageId && upsellItem.variants
          ? upsellItem.variants.find((v) => v.id === item.packageId)
          : undefined;
      const price = variant?.price ?? upsellItem.price;
      itemPrice = price * (item.quantity ?? 1);
    }

    subtotal += itemPrice;

    return {
      tour_id: tourId || null,
      upsell_item_id: upsellItemId || null,
      package_id: item.packageId || null,
      package_name: item.packageName || null,
      adults: item.adults ?? 0,
      children: item.children ?? 0,
      item_date: item.date || null,
      price: itemPrice,
    };
  });

  // 2. Apply Promo Code
  let discountAmount = 0;
  let promoCodeId: string | null = null;

  if (data.promoCode) {
    try {
      const promo = await validatePromoCode(data.promoCode, subtotal);
      promoCodeId = promo.id;

      if (promo.type === 'percentage') {
        discountAmount = (subtotal * promo.value) / 100;
        if (promo.maxDiscountAmount && discountAmount > promo.maxDiscountAmount) {
          discountAmount = promo.maxDiscountAmount;
        }
      } else {
        discountAmount = promo.value;
      }

      // Ensure discount doesn't exceed subtotal
      if (discountAmount > subtotal) discountAmount = subtotal;
    } catch (error) {
      console.warn('Invalid promo code during booking creation:', error);
      // We ignore invalid promo codes silently here or we could throw.
      // Assuming client-side validation passed, this is a safety check.
      // If invalid, we just don't apply discount.
    }
  }

  const finalTotal = subtotal - discountAmount;

  // 2b. Validate tour date availability
  for (const item of nonRoomCartItems) {
    if (item.productType === 'tour' && item.date) {
      const tour = item.product as Tour;
      const itemDate = item.date instanceof Date ? item.date : new Date(item.date as string);
      const dateStr = itemDate.toISOString().split('T')[0];
      const requiredSpots = (item.adults ?? 0) + (item.children ?? 0);

      const check = await checkTourDateAvailability(tour.id, dateStr, requiredSpots);
      if (!check.available) {
        throw new Error(check.reason || `Tour "${tour.name}" is not available on ${dateStr}.`);
      }
    }
  }

  // 2c. Enforce server-side checkout payment method availability
  const paymentAvailability = await getCheckoutPaymentMethodAvailability();
  const requestedPaymentMethodAvailable =
    data.paymentMethod === 'online' ? paymentAvailability.online : paymentAvailability.cash;

  if (!requestedPaymentMethodAvailable) {
    const availableMethods: Array<'cash' | 'online'> = [];

    if (paymentAvailability.cash) availableMethods.push('cash');
    if (paymentAvailability.online) availableMethods.push('online');

    const availableMethodsLabel =
      availableMethods.length > 0 ? availableMethods.join(' or ') : 'none';

    throw new Error(
      `Payment method "${data.paymentMethod}" is currently unavailable. Available methods: ${availableMethodsLabel}.`
    );
  }

  // 3. Insert into bookings table
  const status = data.paymentMethod === 'cash' ? 'Confirmed' : 'Pending';
  const insertPayload = {
    ...(data.bookingId ? { id: data.bookingId } : {}),
    customer_name: data.customerName,
    customer_email: data.customerEmail,
    phone_number: data.phoneNumber,
    nationality: data.nationality,
    total_price: finalTotal,
    discount_amount: discountAmount,
    promo_code_id: promoCodeId,
    status,
    booking_date: new Date().toISOString(),
    payment_method: data.paymentMethod,
    agency_id: agencyId,
  };

  let bookingData: { id: string } | null = null;
  let bookingError: { message?: string } | null = null;

  if (data.bookingId) {
    // Idempotent path: when caller supplies a provisional bookingId (online
    // checkout pre-redirect), upsert so resubmission with the same id updates
    // the existing Pending row instead of creating a duplicate.
    const res = await supabase
      .from('bookings')
      .upsert(insertPayload, { onConflict: 'id' })
      .select('id')
      .single();
    bookingData = (res.data as { id: string } | null) ?? null;
    bookingError = (res.error as { message?: string } | null) ?? null;
  } else {
    const res = await supabase.from('bookings').insert(insertPayload).select('id').single();
    bookingData = (res.data as { id: string } | null) ?? null;
    bookingError = (res.error as { message?: string } | null) ?? null;
  }

  if (bookingError || !bookingData) {
    console.error('Error creating booking:', bookingError);
    throw new Error('Failed to create booking.');
  }

  const bookingId = bookingData.id;
  const isIdempotentBooking = Boolean(data.bookingId);

  try {
    // 4. Insert into booking_items table.
    // For the idempotent upsert path, clear any pre-existing items for this
    // booking id (using the admin client to bypass RLS) so the items reflect
    // the current cart on resubmission.
    if (isIdempotentBooking) {
      const adminClient = await createAdminClient();
      const { error: deleteItemsError } = await adminClient
        .from('booking_items')
        .delete()
        .eq('booking_id', bookingId);

      if (deleteItemsError) {
        console.error('Error clearing existing booking items:', deleteItemsError);
        throw new Error('Failed to refresh booking items.');
      }
    }

    const itemsWithId = bookingItemsToInsert.map((item) => ({
      ...item,
      booking_id: bookingId,
    }));

    if (itemsWithId.length > 0) {
      const { error: itemsError } = await supabase.from('booking_items').insert(itemsWithId);

      if (itemsError) {
        console.error('Error creating booking items:', itemsError);
        throw new Error('Failed to create booking items.');
      }
    }

    // 4b. Persist room cart items into `hotel_bookings` and reserve room inventory.
    if (roomCartItems.length > 0) {
      await persistRoomBookings({
        parentBookingId: bookingId,
        agencyId,
        roomItems: roomCartItems,
        customer: {
          name: data.customerName,
          email: data.customerEmail,
          phone: data.phoneNumber,
        },
        paymentMethod: data.paymentMethod,
        isIdempotent: isIdempotentBooking,
      });
    }
  } catch (error) {
    if (!isIdempotentBooking) {
      try {
        await deleteNewBookingAfterPersistenceFailure({ bookingId, agencyId });
      } catch (cleanupError) {
        console.error('Error cleaning up failed booking:', cleanupError);
        throw new Error(
          `${getErrorMessage(error)} Booking cleanup failed: ${getErrorMessage(cleanupError)}`
        );
      }
    }

    throw error instanceof Error ? error : new Error(getErrorMessage(error));
  }

  // 4c. Decrement available spots for tour dates
  for (const item of nonRoomCartItems) {
    if (item.productType === 'tour' && item.date) {
      const tour = item.product as Tour;
      const itemDate2 = item.date instanceof Date ? item.date : new Date(item.date as string);
      const dateStr = itemDate2.toISOString().split('T')[0];
      const count = (item.adults ?? 0) + (item.children ?? 0);
      try {
        await decrementAvailableSpots(tour.id, dateStr, count);
      } catch (err) {
        console.error('Error decrementing spots:', err);
        // Non-blocking — booking already created
      }
    }
  }

  // 5. Update promo usage count
  if (promoCodeId) {
    // We increment safely
    await supabase.rpc('increment_promo_usage', { promo_id: promoCodeId });
    // If RPC doesn't exist, we can do a simple update, but RPC is better for concurrency.
    // I'll try simple update for now or creating RPC if I can.
    // Simple update:
    /*
    const { data: promo } = await supabase.from('promo_codes').select('usage_count').eq('id', promoCodeId).single();
    if (promo) {
      await supabase.from('promo_codes').update({ usage_count: (promo.usage_count || 0) + 1 }).eq('id', promoCodeId);
    }
    */
    // Better:
    // await supabase.rpc('increment', { table_name: 'promo_codes', row_id: promoCodeId, field: 'usage_count', amount: 1 });
    // I'll stick to simple update for this MVP.
    const { data: currentPromo } = await supabase
      .from('promo_codes')
      .select('usage_count')
      .eq('id', promoCodeId)
      .single();

    if (currentPromo) {
      await supabase
        .from('promo_codes')
        .update({ usage_count: (currentPromo.usage_count || 0) + 1 })
        .eq('id', promoCodeId);
    }
  }

  // 6. Sync Customer Data
  // We try to find an existing customer by email to update their stats, or create a new one.
  try {
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, total_bookings, total_spent')
      .eq('email', data.customerEmail)
      .eq('agency_id', agencyId)
      .maybeSingle();

    if (existingCustomer) {
      await supabase
        .from('customers')
        .update({
          name: data.customerName,
          phone: data.phoneNumber,
          nationality: data.nationality,
          total_bookings: (existingCustomer.total_bookings || 0) + 1,
          total_spent: (existingCustomer.total_spent || 0) + finalTotal,
          last_active: new Date().toISOString(),
        })
        .eq('id', existingCustomer.id);
    } else {
      await supabase.from('customers').insert({
        agency_id: agencyId,
        email: data.customerEmail,
        name: data.customerName,
        phone: data.phoneNumber,
        nationality: data.nationality,
        total_bookings: 1,
        total_spent: finalTotal,
        source: 'Booking',
        last_active: new Date().toISOString(),
        status: 'active',
      });
    }
  } catch (err) {
    console.error('Error syncing customer data:', err);
    // Non-blocking error, we don't fail the booking if customer sync fails
  }

  revalidatePath('/admin/bookings');
  revalidatePath('/admin/customers');

  // 7. Send email notifications (non-blocking)
  try {
    const settings = await getAgencySettings().catch(() => null);
    const agencyData = settings?.data;
    const emailSettings = agencyData?.emailSettings;
    const notifyAdmin = emailSettings?.notifyAdminOnBooking !== false; // default: true
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';

    const emailItems = (() => {
      const out: Array<{
        name: string;
        packageName?: string;
        adults?: number;
        children?: number;
        date?: string;
        price: number;
        nights?: number;
        checkIn?: string;
        checkOut?: string;
        units?: number;
        addonsLabel?: string;
      }> = [];
      let nonRoomIdx = 0;
      for (const item of pricedCartItems) {
        if (item.productType === 'room') {
          const addonsLabel =
            item.addons.length > 0
              ? item.addons
                  .map((a) => `${a.name}${a.quantity > 1 ? ` × ${a.quantity}` : ''}`)
                  .join(', ')
              : undefined;
          out.push({
            name: item.name,
            adults: item.adults,
            children: item.children,
            price: item.subtotal,
            nights: item.nights,
            checkIn: item.checkInDate,
            checkOut: item.checkOutDate,
            units: item.unitsBooked,
            addonsLabel,
          });
        } else {
          out.push({
            name: item.product.name,
            packageName: item.packageName,
            adults: item.productType === 'tour' ? (item.adults ?? 0) : undefined,
            children: item.productType === 'tour' ? (item.children ?? 0) : undefined,
            date: item.date ? item.date.toISOString() : undefined,
            price: bookingItemsToInsert[nonRoomIdx]?.price ?? 0,
          });
          nonRoomIdx += 1;
        }
      }
      return out;
    })();

    const sharedOpts = { agencyEmailSettings: emailSettings };

    // 7a. Customer confirmation
    await sendEmail({
      ...sharedOpts,
      to: data.customerEmail,
      subject: `Booking Received — ${agencyData?.agencyName || 'Your Travel Agency'}`,
      html: renderBookingConfirmationEmail({
        agencyName: agencyData?.agencyName || 'Your Travel Agency',
        agencyLogoUrl: settings?.logo_url || undefined,
        agencyEmail: agencyData?.contactEmail,
        agencyPhone: agencyData?.phoneNumber,
        bookingId,
        customerName: data.customerName,
        paymentMethod: data.paymentMethod,
        status,
        items: emailItems,
        subtotal,
        discountAmount,
        totalPrice: finalTotal,
      }),
    });

    // 7a-ii. If payment is online (status = Pending), send a dedicated "complete your payment" reminder
    if (data.paymentMethod === 'online') {
      const agencyName = agencyData?.agencyName || 'Your Travel Agency';
      const pendingHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Complete Your Payment</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#78350f,#d97706);padding:32px 40px;text-align:center;">
            ${settings?.logo_url ? `<img src="${settings.logo_url}" alt="${agencyName}" style="max-height:44px;max-width:180px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;" />` : ''}
            <div style="font-size:40px;margin-bottom:8px;">⏳</div>
            <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Payment Pending</h1>
            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">${agencyName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="font-size:15px;color:#555;margin:0 0 16px;">Hi <strong>${data.customerName}</strong>,</p>
            <p style="font-size:15px;color:#555;margin:0 0 24px;">
              We've received your booking request. Your reservation is <strong>held for 24 hours</strong>
              while your payment is being processed. Please complete your payment to confirm your spot.
            </p>
            <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
              <span style="font-size:12px;text-transform:uppercase;color:#888;letter-spacing:0.5px;">Booking Reference</span><br />
              <strong style="font-size:18px;color:#111;font-family:monospace;">#${bookingId.substring(0, 8).toUpperCase()}</strong>
            </div>
            <p style="font-size:13px;color:#888;margin:0;">
              If you did not complete the payment redirect, please contact us and we'll resend the payment link.
              ${agencyData?.contactEmail ? `<br />📧 <a href="mailto:${agencyData.contactEmail}" style="color:#2563eb;">${agencyData.contactEmail}</a>` : ''}
              ${agencyData?.phoneNumber ? `<br />📞 ${agencyData.phoneNumber}` : ''}
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 40px;text-align:center;font-size:12px;color:#888;">
            ${agencyName}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      await sendEmail({
        ...sharedOpts,
        to: data.customerEmail,
        subject: `⏳ Complete Your Payment — Booking #${bookingId.substring(0, 8).toUpperCase()}`,
        html: pendingHtml,
      });
    }

    // 7b. Admin notification
    if (notifyAdmin && agencyData?.contactEmail) {
      await sendEmail({
        ...sharedOpts,
        to: agencyData.contactEmail,
        fromName: 'Booking Alert',
        subject: `New Booking #${bookingId.substring(0, 8).toUpperCase()} — ${data.customerName}`,
        html: renderBookingNotificationEmail({
          agencyName: agencyData?.agencyName || 'Your Travel Agency',
          bookingId,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.phoneNumber,
          customerNationality: data.nationality,
          paymentMethod: data.paymentMethod,
          items: emailItems,
          totalPrice: finalTotal,
          discountAmount,
          adminBookingUrl: `${appUrl}/admin/bookings/${bookingId}`,
        }),
      });
    }
  } catch (emailErr) {
    console.error('Error sending booking emails:', emailErr);
    // Non-blocking: booking succeeds even if emails fail
  }

  return bookingId as string;
}

/**
 * Cancels stale online Pending bookings older than 60 minutes for the
 * current agency. Used to garbage-collect rows where the customer abandoned
 * the Kashier redirect without completing payment.
 *
 * Returns the number of rows transitioned to 'Cancelled'.
 */
export async function cleanupStalePendingBookings(): Promise<number> {
  const supabase = await createAdminClient();
  const agencyId = await getCurrentAgencyId();

  const cutoffIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'Cancelled' })
    .eq('agency_id', agencyId)
    .eq('status', 'Pending')
    .eq('payment_method', 'online')
    .lt('created_at', cutoffIso)
    .select('id');

  if (error) {
    console.error('Error cleaning up stale pending bookings:', error);
    throw new Error('Failed to clean up stale pending bookings.');
  }

  const cancelledCount = data?.length ?? 0;

  if (cancelledCount > 0) {
    revalidatePath('/admin/bookings');
  }

  return cancelledCount;
}

// ─────────────────────────────────────────────────────────────────────────────
// Room cart persistence
// ─────────────────────────────────────────────────────────────────────────────

const PG_UNDEFINED_COLUMN = '42703';

type AdminSupabaseClient = Awaited<ReturnType<typeof createAdminClient>>;

type RoomInventoryRpcArgs = {
  p_room_type_id: string;
  p_check_in: string;
  p_check_out: string;
  p_units: number;
};

type HotelBookingInventoryRow = {
  id: string;
  room_type_id: string | null;
  check_in: string | null;
  check_out: string | null;
  units: number | string | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Unknown error.';
}

function normalizeBookedUnits(value: number | string | null | undefined): number {
  const units = Math.trunc(Number(value ?? 0));
  if (!Number.isFinite(units) || units < 1) {
    throw new Error('Room booking units must be >= 1.');
  }
  return units;
}

function getRoomInventoryArgs(room: RoomCartItem): RoomInventoryRpcArgs {
  return {
    p_room_type_id: room.roomTypeId,
    p_check_in: room.checkInDate,
    p_check_out: room.checkOutDate,
    p_units: normalizeBookedUnits(room.unitsBooked),
  };
}

function getExistingHotelBookingInventoryArgs(row: HotelBookingInventoryRow): RoomInventoryRpcArgs {
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
  supabase: AdminSupabaseClient,
  functionName: 'reserve_room_inventory' | 'release_room_inventory',
  args: RoomInventoryRpcArgs,
  failureMessage: string
): Promise<void> {
  const { error } = await supabase.rpc(functionName, args);
  if (error) {
    throw new Error(`${failureMessage}: ${getErrorMessage(error)}`);
  }
}

async function reserveRoomInventory(
  supabase: AdminSupabaseClient,
  room: RoomCartItem
): Promise<void> {
  await callRoomInventoryRpc(
    supabase,
    'reserve_room_inventory',
    getRoomInventoryArgs(room),
    `Room "${room.name}" is no longer available`
  );
}

async function releaseRoomInventory(
  supabase: AdminSupabaseClient,
  args: RoomInventoryRpcArgs,
  failureMessage: string
): Promise<void> {
  await callRoomInventoryRpc(supabase, 'release_room_inventory', args, failureMessage);
}

async function releaseExistingHotelBookings(params: {
  supabase: AdminSupabaseClient;
  agencyId: string;
  parentBookingId: string;
}): Promise<void> {
  const { data, error } = await params.supabase
    .from('hotel_bookings')
    .select('id, room_type_id, check_in, check_out, units')
    .eq('agency_id', params.agencyId)
    .eq('payment_reference', params.parentBookingId);

  if (error) {
    throw new Error(`Failed to load previous hotel bookings: ${getErrorMessage(error)}`);
  }

  const existingRows = ((data ?? []) as HotelBookingInventoryRow[]).filter((row) => row.id);
  if (existingRows.length === 0) return;

  for (const row of existingRows) {
    await releaseRoomInventory(
      params.supabase,
      getExistingHotelBookingInventoryArgs(row),
      `Failed to release previous hotel booking ${row.id}`
    );
  }

  const { error: deleteError } = await params.supabase
    .from('hotel_bookings')
    .delete()
    .in(
      'id',
      existingRows.map((row) => row.id)
    );

  if (deleteError) {
    throw new Error(`Failed to refresh hotel bookings: ${getErrorMessage(deleteError)}`);
  }
}

async function cleanupNewRoomReservations(params: {
  supabase: AdminSupabaseClient;
  agencyId: string;
  parentBookingId: string;
  rooms: RoomCartItem[];
}): Promise<string[]> {
  const failures: string[] = [];

  for (const room of params.rooms) {
    const { error } = await params.supabase.rpc(
      'release_room_inventory',
      getRoomInventoryArgs(room)
    );
    if (error) {
      failures.push(`release ${room.name}: ${getErrorMessage(error)}`);
    }
  }

  const { error: deleteError } = await params.supabase
    .from('hotel_bookings')
    .delete()
    .eq('agency_id', params.agencyId)
    .eq('payment_reference', params.parentBookingId);

  if (deleteError) {
    failures.push(`delete partial hotel bookings: ${getErrorMessage(deleteError)}`);
  }

  return failures;
}

/**
 * Insert one `hotel_bookings` row per room cart item and reserve
 * `room_inventory.available_units` atomically for each stay.
 *
 * Idempotency: when the parent `bookings` row was created via the upsert
 * path (`isIdempotent`), pre-existing `hotel_bookings` rows linked to the
 * same parent (by `payment_reference = parentBookingId`) are first released
 * back into inventory, then deleted and re-inserted to reflect the latest
 * cart state.
 *
 * The insert is defensive against the optional `addons / nights / currency
 * / base_price_per_night / price_per_night_avg / idempotency_key`
 * extension migration: if any of those columns do not exist yet
 * (Postgres 42703), the insert is retried with the base column set so
 * deployments that haven't applied the migration still succeed.
 */
async function persistRoomBookings(params: {
  parentBookingId: string;
  agencyId: string;
  roomItems: RoomCartItem[];
  customer: { name: string; email: string; phone: string };
  paymentMethod: 'cash' | 'online';
  isIdempotent: boolean;
}): Promise<void> {
  const supabase = await createAdminClient();
  const status = params.paymentMethod === 'cash' ? 'confirmed' : 'pending';
  const newlyReservedRooms: RoomCartItem[] = [];

  if (params.isIdempotent) {
    await releaseExistingHotelBookings({
      supabase,
      agencyId: params.agencyId,
      parentBookingId: params.parentBookingId,
    });
  }

  try {
    for (const room of params.roomItems) {
      const addonsTotal = roomAddonsTotal(room);
      const stayCost = roundCurrency(Math.max(0, room.subtotal - addonsTotal));

      const baseRow: Record<string, unknown> = {
        agency_id: params.agencyId,
        hotel_id: room.hotelId,
        room_type_id: room.roomTypeId,
        check_in: room.checkInDate,
        check_out: room.checkOutDate,
        units: room.unitsBooked,
        guests_adults: room.adults,
        guests_children: room.children,
        guest_name: params.customer.name,
        guest_email: params.customer.email,
        guest_phone: params.customer.phone,
        status,
        payment_provider: params.paymentMethod === 'online' ? 'kashier' : 'cash',
        payment_reference: params.parentBookingId,
        subtotal: stayCost,
        tax: 0,
        fees: addonsTotal,
        total: roundCurrency(room.subtotal),
      };

      const extendedRow: Record<string, unknown> = {
        ...baseRow,
        bookings_id: params.parentBookingId,
        nights: room.nights,
        currency: room.currency,
        base_price_per_night: room.basePricePerNight,
        price_per_night_avg: room.pricePerNightAvg,
        addons: room.tier
          ? [
              ...room.addons,
              {
                // Sentinel record used to surface the active stay-length tier
                // alongside addons in the persisted jsonb. unitPrice/quantity
                // are zero so any reader that sums (unitPrice * quantity)
                // continues to produce the same total.
                id: '_tier',
                name: '_tier',
                unitPrice: 0,
                quantity: 0,
                currency: room.currency,
                _tier: room.tier,
              },
            ]
          : room.addons,
        idempotency_key: `${params.parentBookingId}:${room.lineId}`,
      };

      await reserveRoomInventory(supabase, room);
      newlyReservedRooms.push(room);

      const insertOnce = async (row: Record<string, unknown>) =>
        supabase.from('hotel_bookings').insert(row);

      let res = await insertOnce(extendedRow);
      if (res.error) {
        const code = (res.error as { code?: string }).code;
        if (code === PG_UNDEFINED_COLUMN) {
          res = await insertOnce(baseRow);
        }
        if (res.error) {
          throw new Error(`Failed to create hotel booking: ${getErrorMessage(res.error)}`);
        }
      }
    }
  } catch (error) {
    if (newlyReservedRooms.length > 0) {
      const cleanupFailures = await cleanupNewRoomReservations({
        supabase,
        agencyId: params.agencyId,
        parentBookingId: params.parentBookingId,
        rooms: newlyReservedRooms,
      });

      if (cleanupFailures.length > 0) {
        throw new Error(
          `${getErrorMessage(error)} Inventory cleanup failed: ${cleanupFailures.join('; ')}`
        );
      }
    }

    throw error instanceof Error ? error : new Error(getErrorMessage(error));
  }
}
